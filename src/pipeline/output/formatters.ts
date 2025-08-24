import { USARecord, PipelineConfig } from "../types.ts";
import { Result } from "../../shared/types/index.ts";

/**
 * Base output formatter interface
 */
export interface OutputFormatter {
  format(record: USARecord): string;
  formatBatch(records: USARecord[]): string;
  getContentType(): string;
}

/**
 * JSON output formatter
 */
export class JsonFormatter implements OutputFormatter {
  private config: PipelineConfig["output"];

  constructor(config?: Partial<PipelineConfig["output"]>) {
    this.config = {
      format: "json",
      compression: config?.compression ?? false,
      includeMetadata: config?.includeMetadata ?? true,
    };
  }

  format(record: USARecord): string {
    const output = this.config.includeMetadata
      ? record
      : { id: record.id, data: record.data };
    
    return JSON.stringify(output);
  }

  formatBatch(records: USARecord[]): string {
    const output = this.config.includeMetadata
      ? records
      : records.map(r => ({ id: r.id, data: r.data }));
    
    return JSON.stringify(output, null, 2);
  }

  getContentType(): string {
    return "application/json";
  }
}

/**
 * NDJSON (Newline Delimited JSON) formatter
 */
export class NdjsonFormatter implements OutputFormatter {
  private config: PipelineConfig["output"];

  constructor(config?: Partial<PipelineConfig["output"]>) {
    this.config = {
      format: "ndjson",
      compression: config?.compression ?? false,
      includeMetadata: config?.includeMetadata ?? false,
    };
  }

  format(record: USARecord): string {
    const output = this.config.includeMetadata
      ? record
      : { id: record.id, data: record.data };
    
    return JSON.stringify(output);
  }

  formatBatch(records: USARecord[]): string {
    return records
      .map(record => this.format(record))
      .join("\n");
  }

  getContentType(): string {
    return "application/x-ndjson";
  }
}

/**
 * CSV output formatter
 */
export class CsvFormatter implements OutputFormatter {
  private config: PipelineConfig["output"];
  private headers: Set<string> = new Set();

  constructor(config?: Partial<PipelineConfig["output"]>) {
    this.config = {
      format: "csv",
      compression: config?.compression ?? false,
      includeMetadata: config?.includeMetadata ?? false,
    };
  }

  format(record: USARecord): string {
    const flat = this.flattenRecord(record);
    const values = Array.from(this.headers).map(header => {
      const value = flat[header];
      return this.escapeCSV(String(value ?? ""));
    });
    
    return values.join(",");
  }

  formatBatch(records: USARecord[]): string {
    if (records.length === 0) return "";
    
    // Collect all headers
    this.headers.clear();
    const flatRecords = records.map(r => this.flattenRecord(r));
    flatRecords.forEach(flat => {
      Object.keys(flat).forEach(key => this.headers.add(key));
    });
    
    // Sort headers for consistency
    const sortedHeaders = Array.from(this.headers).sort();
    this.headers = new Set(sortedHeaders);
    
    // Create CSV
    const lines: string[] = [];
    
    // Add header row
    lines.push(sortedHeaders.map(h => this.escapeCSV(h)).join(","));
    
    // Add data rows
    for (const flat of flatRecords) {
      const values = sortedHeaders.map(header => {
        const value = flat[header];
        return this.escapeCSV(String(value ?? ""));
      });
      lines.push(values.join(","));
    }
    
    return lines.join("\n");
  }

  getContentType(): string {
    return "text/csv";
  }

  /**
   * Flatten nested record structure
   */
  private flattenRecord(
    record: USARecord,
    prefix = ""
  ): Record<string, unknown> {
    const flat: Record<string, unknown> = {};
    
    if (this.config.includeMetadata) {
      flat[`${prefix}id`] = record.id;
      flat[`${prefix}timestamp`] = record.timestamp.toISOString();
      flat[`${prefix}type`] = record.type;
      if (record.processingTime) {
        flat[`${prefix}processingTime`] = record.processingTime;
      }
    } else {
      flat[`${prefix}id`] = record.id;
    }
    
    // Flatten data object
    this.flattenObject(record.data, flat, `${prefix}data.`);
    
    return flat;
  }

  /**
   * Recursively flatten object
   */
  private flattenObject(
    obj: Record<string, unknown>,
    result: Record<string, unknown>,
    prefix: string
  ): void {
    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) {
        result[`${prefix}${key}`] = "";
      } else if (typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
        this.flattenObject(
          value as Record<string, unknown>,
          result,
          `${prefix}${key}.`
        );
      } else if (Array.isArray(value)) {
        result[`${prefix}${key}`] = JSON.stringify(value);
      } else if (value instanceof Date) {
        result[`${prefix}${key}`] = value.toISOString();
      } else {
        result[`${prefix}${key}`] = value;
      }
    }
  }

  /**
   * Escape CSV values
   */
  private escapeCSV(value: string): string {
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}

/**
 * Output writer that handles different formats and destinations
 */
export class OutputWriter {
  private formatter: OutputFormatter;
  private buffer: USARecord[] = [];
  private bufferSize: number;

  constructor(
    format: "json" | "csv" | "ndjson" = "json",
    bufferSize = 100,
    config?: Partial<PipelineConfig["output"]>
  ) {
    this.bufferSize = bufferSize;
    
    switch (format) {
      case "csv":
        this.formatter = new CsvFormatter(config);
        break;
      case "ndjson":
        this.formatter = new NdjsonFormatter(config);
        break;
      default:
        this.formatter = new JsonFormatter(config);
    }
  }

  /**
   * Write single record
   */
  async writeRecord(
    record: USARecord,
    writer?: WritableStreamDefaultWriter<Uint8Array>
  ): Promise<void> {
    const formatted = this.formatter.format(record);
    const encoded = new TextEncoder().encode(formatted + "\n");
    
    if (writer) {
      await writer.write(encoded);
    } else {
      await Deno.stdout.write(encoded);
    }
  }

  /**
   * Buffer and write records in batches
   */
  async bufferRecord(
    record: USARecord,
    writer?: WritableStreamDefaultWriter<Uint8Array>
  ): Promise<void> {
    this.buffer.push(record);
    
    if (this.buffer.length >= this.bufferSize) {
      await this.flush(writer);
    }
  }

  /**
   * Flush buffered records
   */
  async flush(writer?: WritableStreamDefaultWriter<Uint8Array>): Promise<void> {
    if (this.buffer.length === 0) return;
    
    const formatted = this.formatter.formatBatch(this.buffer);
    const encoded = new TextEncoder().encode(formatted + "\n");
    
    if (writer) {
      await writer.write(encoded);
    } else {
      await Deno.stdout.write(encoded);
    }
    
    this.buffer = [];
  }

  /**
   * Write to file
   */
  async writeToFile(
    records: USARecord[],
    path: string
  ): Promise<Result<void, Error>> {
    try {
      const formatted = this.formatter.formatBatch(records);
      await Deno.writeTextFile(path, formatted);
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Create writable stream
   */
  createWritableStream(): WritableStream<USARecord> {
    const formatter = this.formatter;
    const encoder = new TextEncoder();
    
    return new WritableStream<USARecord>({
      write(record) {
        const formatted = formatter.format(record);
        const encoded = encoder.encode(formatted + "\n");
        return Deno.stdout.write(encoded);
      },
    });
  }

  /**
   * Get content type for HTTP responses
   */
  getContentType(): string {
    return this.formatter.getContentType();
  }
}