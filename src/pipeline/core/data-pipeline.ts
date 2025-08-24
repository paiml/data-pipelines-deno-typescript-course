import {
  EURecord,
  USARecord,
  PipelineConfig,
  PipelineMetrics,
  DeadLetterEntry,
} from "../types.ts";
import { Result } from "../../shared/types/index.ts";
import { StreamIngestion } from "../ingestion/stream-ingestion.ts";
import { ConverterPipeline } from "../transformation/converter-pipeline.ts";
import { OutputWriter } from "../output/formatters.ts";

/**
 * Main data pipeline orchestrator with error handling and backpressure
 */
export class DataPipeline {
  private ingestion: StreamIngestion;
  private transformation: ConverterPipeline;
  private output: OutputWriter;
  private config: PipelineConfig;
  
  private deadLetterQueue: DeadLetterEntry[] = [];
  private isRunning = false;
  private abortController: AbortController | null = null;
  
  // Backpressure control
  private processingQueue: EURecord[] = [];
  private maxQueueSize: number;
  private backpressureThreshold: number;

  constructor(config?: Partial<PipelineConfig>) {
    this.config = this.mergeConfig(config);
    
    this.ingestion = new StreamIngestion(this.config.ingestion);
    this.transformation = new ConverterPipeline(this.config.transformation);
    this.output = new OutputWriter(
      this.config.output.format,
      100,
      this.config.output
    );
    
    this.maxQueueSize = 1000;
    this.backpressureThreshold = 800;
  }

  /**
   * Process data from HTTP endpoint
   */
  async processFromHttp(
    url: string,
    options?: RequestInit
  ): Promise<PipelineMetrics> {
    const source = this.ingestion.ingestFromHttp(url, options);
    return this.process(source);
  }

  /**
   * Process data from file
   */
  async processFromFile(path: string): Promise<PipelineMetrics> {
    const source = this.ingestion.ingestFromFile(path);
    return this.process(source);
  }

  /**
   * Process data from WebSocket
   */
  async processFromWebSocket(url: string): Promise<PipelineMetrics> {
    const source = this.ingestion.ingestFromWebSocket(url);
    return this.process(source);
  }

  /**
   * Process data from array
   */
  async processFromArray(records: unknown[]): Promise<PipelineMetrics> {
    const source = this.ingestion.ingestFromArray(records);
    return this.process(source);
  }

  /**
   * Main processing pipeline with backpressure control
   */
  private async process(
    source: AsyncIterable<Result<EURecord, Error>>
  ): Promise<PipelineMetrics> {
    this.isRunning = true;
    this.abortController = new AbortController();
    
    const validRecords = this.filterValidRecords(source);
    const throttled = this.applyBackpressure(validRecords);
    const transformed = this.transformation.process(throttled);
    
    try {
      for await (const result of transformed) {
        if (!this.isRunning) break;
        
        if (result.success) {
          await this.handleSuccess(result.value);
        } else {
          await this.handleError(result.error, null);
        }
      }
      
      // Flush any remaining output
      await this.output.flush();
      
    } catch (error) {
      console.error("Pipeline error:", error);
      throw error;
    } finally {
      this.isRunning = false;
    }
    
    return this.transformation.getMetrics();
  }

  /**
   * Filter valid records and handle ingestion errors
   */
  private async *filterValidRecords(
    source: AsyncIterable<Result<EURecord, Error>>
  ): AsyncGenerator<EURecord> {
    for await (const result of source) {
      if (result.success) {
        yield result.value;
      } else {
        await this.handleError(result.error, null, "ingestion");
      }
    }
  }

  /**
   * Apply backpressure control
   */
  private async *applyBackpressure(
    source: AsyncIterable<EURecord>
  ): AsyncGenerator<EURecord> {
    for await (const record of source) {
      // Check queue size for backpressure
      while (this.processingQueue.length >= this.backpressureThreshold) {
        // Wait for queue to drain
        await new Promise(resolve => setTimeout(resolve, 10));
        
        if (!this.isRunning) return;
      }
      
      // Add to queue
      this.processingQueue.push(record);
      
      // Process from queue
      while (this.processingQueue.length > 0 && this.isRunning) {
        const next = this.processingQueue.shift();
        if (next) {
          yield next;
        }
      }
    }
    
    // Drain remaining queue
    while (this.processingQueue.length > 0 && this.isRunning) {
      const next = this.processingQueue.shift();
      if (next) {
        yield next;
      }
    }
  }

  /**
   * Handle successful record processing
   */
  private async handleSuccess(record: USARecord): Promise<void> {
    try {
      await this.output.bufferRecord(record);
    } catch (error) {
      await this.handleError(error as Error, record, "output");
    }
  }

  /**
   * Handle errors with retry and dead letter queue
   */
  private async handleError(
    error: Error,
    record: unknown,
    stage: string
  ): Promise<void> {
    const entry: DeadLetterEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      record,
      error,
      attempts: 1,
      stage,
    };
    
    if (this.config.errorHandling.deadLetterQueue) {
      // Add to dead letter queue
      this.deadLetterQueue.push(entry);
      
      // Log error
      if (this.config.performance.logLevel !== "error") {
        console.error(`Error in ${stage}:`, error.message);
      }
      
      // Retry if configured
      if (entry.attempts < this.config.errorHandling.maxRetries) {
        await this.retryRecord(entry);
      }
    } else {
      // Just log and continue
      console.error(`Error in ${stage}:`, error);
    }
  }

  /**
   * Retry failed record with backoff
   */
  private async retryRecord(entry: DeadLetterEntry): Promise<void> {
    const delay = this.calculateBackoff(
      entry.attempts,
      this.config.errorHandling.retryBackoff
    );
    
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Increment attempts
    entry.attempts++;
    
    // Re-process based on stage
    if (entry.stage === "transformation" && entry.record) {
      // Retry transformation
      const result = await this.transformation.process(
        async function* () { yield entry.record as EURecord; }()
      ).next();
      
      if (result.value && !result.done) {
        if (result.value.success) {
          await this.handleSuccess(result.value.value);
        } else {
          // Failed again, keep in DLQ
          console.error(`Retry failed for record:`, entry.id);
        }
      }
    }
  }

  /**
   * Calculate backoff delay
   */
  private calculateBackoff(
    attempt: number,
    strategy: "linear" | "exponential"
  ): number {
    const baseDelay = 1000; // 1 second
    
    if (strategy === "exponential") {
      return Math.min(baseDelay * Math.pow(2, attempt - 1), 30000);
    } else {
      return Math.min(baseDelay * attempt, 10000);
    }
  }

  /**
   * Stop the pipeline
   */
  stop(): void {
    this.isRunning = false;
    this.abortController?.abort();
    this.ingestion.abort();
  }

  /**
   * Reset the pipeline
   */
  reset(): void {
    this.stop();
    this.transformation.reset();
    this.ingestion.reset();
    this.processingQueue = [];
    this.deadLetterQueue = [];
  }

  /**
   * Get dead letter queue entries
   */
  getDeadLetterQueue(): DeadLetterEntry[] {
    return [...this.deadLetterQueue];
  }

  /**
   * Clear dead letter queue
   */
  clearDeadLetterQueue(): void {
    this.deadLetterQueue = [];
  }

  /**
   * Get current metrics
   */
  getMetrics(): PipelineMetrics {
    return this.transformation.getMetrics();
  }

  /**
   * Get queue size (for monitoring)
   */
  getQueueSize(): number {
    return this.processingQueue.length;
  }

  /**
   * Check if backpressure is active
   */
  isBackpressureActive(): boolean {
    return this.processingQueue.length >= this.backpressureThreshold;
  }

  /**
   * Merge configuration with defaults
   */
  private mergeConfig(partial?: Partial<PipelineConfig>): PipelineConfig {
    return {
      ingestion: {
        batchSize: 100,
        timeout: 30000,
        retryAttempts: 3,
        ...partial?.ingestion,
      },
      transformation: {
        parallel: false,
        maxConcurrency: 10,
        preserveOriginal: true,
        ...partial?.transformation,
      },
      output: {
        format: "json",
        compression: false,
        includeMetadata: true,
        ...partial?.output,
      },
      errorHandling: {
        deadLetterQueue: true,
        maxRetries: 3,
        retryBackoff: "exponential",
        ...partial?.errorHandling,
      },
      performance: {
        monitoring: true,
        metricsInterval: 5000,
        logLevel: "info",
        ...partial?.performance,
      },
    };
  }
}