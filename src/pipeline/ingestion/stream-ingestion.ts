import { EURecord, EURecordSchema, PipelineConfig } from "../types.ts";
import { Result } from "../../shared/types/index.ts";
import { z } from "zod";

/**
 * Stream ingestion layer for various data sources
 */
export class StreamIngestion {
  private abortController: AbortController | null = null;
  private config: PipelineConfig["ingestion"];

  constructor(config?: Partial<PipelineConfig["ingestion"]>) {
    this.config = {
      batchSize: config?.batchSize ?? 100,
      timeout: config?.timeout ?? 30000,
      retryAttempts: config?.retryAttempts ?? 3,
    };
  }

  /**
   * Ingest from HTTP endpoint
   */
  async *ingestFromHttp(
    url: string,
    options?: RequestInit
  ): AsyncGenerator<Result<EURecord, Error>> {
    try {
      const response = await fetch(url, {
        ...options,
        signal: this.abortController?.signal,
      });

      if (!response.ok) {
        yield Result.err(
          new Error(`HTTP error: ${response.status} ${response.statusText}`)
        );
        return;
      }

      const contentType = response.headers.get("content-type");

      if (contentType?.includes("application/json")) {
        yield* this.processJsonResponse(response);
      } else if (contentType?.includes("text/plain") || contentType?.includes("application/x-ndjson")) {
        yield* this.processNdjsonResponse(response);
      } else {
        yield Result.err(
          new Error(`Unsupported content type: ${contentType}`)
        );
      }
    } catch (error) {
      yield Result.err(
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Ingest from file
   */
  async *ingestFromFile(
    path: string
  ): AsyncGenerator<Result<EURecord, Error>> {
    try {
      const file = await Deno.open(path, { read: true });
      const decoder = new TextDecoder();
      
      for await (const chunk of file.readable) {
        const text = decoder.decode(chunk);
        const lines = text.split("\n").filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const record = JSON.parse(line);
            const validated = EURecordSchema.safeParse(record);
            
            if (validated.success) {
              yield Result.ok(validated.data);
            } else {
              yield Result.err(
                new Error(`Validation failed: ${validated.error.message}`)
              );
            }
          } catch (error) {
            yield Result.err(
              new Error(`Parse error: ${error}`)
            );
          }
        }
      }
    } catch (error) {
      yield Result.err(
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Ingest from WebSocket
   */
  async *ingestFromWebSocket(
    url: string
  ): AsyncGenerator<Result<EURecord, Error>> {
    try {
      const ws = new WebSocket(url);
      const messageQueue: Result<EURecord, Error>[] = [];
      let resolver: ((value: IteratorResult<Result<EURecord, Error>>) => void) | null = null;

      ws.onmessage = (event) => {
        try {
          const record = JSON.parse(event.data);
          const validated = EURecordSchema.safeParse(record);
          
          const result = validated.success
            ? Result.ok(validated.data)
            : Result.err(new Error(`Validation failed: ${validated.error.message}`));
          
          if (resolver) {
            resolver({ value: result, done: false });
            resolver = null;
          } else {
            messageQueue.push(result);
          }
        } catch (error) {
          const errorResult = Result.err(
            new Error(`Parse error: ${error}`)
          );
          
          if (resolver) {
            resolver({ value: errorResult, done: false });
            resolver = null;
          } else {
            messageQueue.push(errorResult);
          }
        }
      };

      ws.onerror = (error) => {
        const errorResult = Result.err(
          new Error(`WebSocket error: ${error}`)
        );
        
        if (resolver) {
          resolver({ value: errorResult, done: false });
          resolver = null;
        } else {
          messageQueue.push(errorResult);
        }
      };

      ws.onclose = () => {
        if (resolver) {
          resolver({ value: Result.err(new Error("WebSocket closed")), done: true });
        }
      };

      // Wait for connection
      await new Promise((resolve, reject) => {
        ws.onopen = resolve;
        ws.onerror = reject;
      });

      // Yield messages
      while (ws.readyState === WebSocket.OPEN || messageQueue.length > 0) {
        if (messageQueue.length > 0) {
          yield messageQueue.shift()!;
        } else {
          yield await new Promise<Result<EURecord, Error>>((resolve) => {
            resolver = (result) => {
              resolve(result.value);
              return result;
            };
          });
        }
      }
    } catch (error) {
      yield Result.err(
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Ingest from array (for testing and batch processing)
   */
  async *ingestFromArray(
    records: unknown[]
  ): AsyncGenerator<Result<EURecord, Error>> {
    for (const record of records) {
      const validated = EURecordSchema.safeParse(record);
      
      if (validated.success) {
        yield Result.ok(validated.data);
      } else {
        yield Result.err(
          new Error(`Validation failed: ${validated.error.message}`)
        );
      }
      
      // Small delay to simulate stream processing
      await new Promise(resolve => setTimeout(resolve, 1));
    }
  }

  /**
   * Process JSON response
   */
  private async *processJsonResponse(
    response: Response
  ): AsyncGenerator<Result<EURecord, Error>> {
    try {
      const data = await response.json();
      const records = Array.isArray(data) ? data : [data];
      
      yield* this.ingestFromArray(records);
    } catch (error) {
      yield Result.err(
        new Error(`JSON parse error: ${error}`)
      );
    }
  }

  /**
   * Process NDJSON response
   */
  private async *processNdjsonResponse(
    response: Response
  ): AsyncGenerator<Result<EURecord, Error>> {
    const reader = response.body?.getReader();
    if (!reader) {
      yield Result.err(new Error("No response body"));
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        
        // Keep the last incomplete line in the buffer
        buffer = lines.pop() || "";
        
        for (const line of lines) {
          if (!line.trim()) continue;
          
          try {
            const record = JSON.parse(line);
            const validated = EURecordSchema.safeParse(record);
            
            if (validated.success) {
              yield Result.ok(validated.data);
            } else {
              yield Result.err(
                new Error(`Validation failed: ${validated.error.message}`)
              );
            }
          } catch (error) {
            yield Result.err(
              new Error(`Parse error: ${error}`)
            );
          }
        }
      }
      
      // Process any remaining data
      if (buffer.trim()) {
        try {
          const record = JSON.parse(buffer);
          const validated = EURecordSchema.safeParse(record);
          
          if (validated.success) {
            yield Result.ok(validated.data);
          } else {
            yield Result.err(
              new Error(`Validation failed: ${validated.error.message}`)
            );
          }
        } catch (error) {
          yield Result.err(
            new Error(`Parse error: ${error}`)
          );
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Abort ongoing ingestion
   */
  abort(): void {
    this.abortController?.abort();
  }

  /**
   * Reset the ingestion layer
   */
  reset(): void {
    this.abort();
    this.abortController = new AbortController();
  }
}