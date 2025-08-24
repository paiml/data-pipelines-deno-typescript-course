import { z } from "zod";
import { Result } from "../shared/types/index.ts";

/**
 * Base record structure for EU data
 */
export const EURecordSchema = z.object({
  id: z.string(),
  timestamp: z.date().optional(),
  type: z.enum(["currency", "unit", "date", "number", "mixed"]),
  data: z.record(z.unknown()),
});

export type EURecord = z.infer<typeof EURecordSchema>;

/**
 * Base record structure for USA data
 */
export const USARecordSchema = z.object({
  id: z.string(),
  timestamp: z.date(),
  type: z.enum(["currency", "unit", "date", "number", "mixed"]),
  data: z.record(z.unknown()),
  originalData: z.record(z.unknown()).optional(),
  processingTime: z.number().optional(),
});

export type USARecord = z.infer<typeof USARecordSchema>;

/**
 * Pipeline configuration
 */
export interface PipelineConfig {
  // Ingestion settings
  ingestion: {
    batchSize: number;
    timeout: number;
    retryAttempts: number;
  };
  
  // Transformation settings
  transformation: {
    parallel: boolean;
    maxConcurrency: number;
    preserveOriginal: boolean;
  };
  
  // Output settings
  output: {
    format: "json" | "csv" | "ndjson";
    compression: boolean;
    includeMetadata: boolean;
  };
  
  // Error handling
  errorHandling: {
    deadLetterQueue: boolean;
    maxRetries: number;
    retryBackoff: "linear" | "exponential";
  };
  
  // Performance
  performance: {
    monitoring: boolean;
    metricsInterval: number;
    logLevel: "debug" | "info" | "warn" | "error";
  };
}

/**
 * Pipeline metrics
 */
export interface PipelineMetrics {
  processed: number;
  failed: number;
  retried: number;
  throughput: number;
  avgLatency: number;
  p99Latency: number;
  errors: Map<string, number>;
  startTime: Date;
  endTime?: Date;
}

/**
 * Stream processor interface
 */
export interface StreamProcessor<TInput, TOutput> {
  process(
    source: AsyncIterable<TInput>
  ): AsyncIterable<Result<TOutput, Error>>;
  
  getMetrics(): PipelineMetrics;
  
  reset(): void;
}

/**
 * Pipeline stage interface
 */
export interface PipelineStage<TInput, TOutput> {
  name: string;
  
  execute(
    input: TInput,
    context?: PipelineContext
  ): Promise<Result<TOutput, Error>>;
  
  validate?(input: TInput): boolean;
  
  getMetrics?(): Record<string, unknown>;
}

/**
 * Pipeline context for passing data between stages
 */
export interface PipelineContext {
  correlationId: string;
  startTime: number;
  metadata: Map<string, unknown>;
  errors: Error[];
}

/**
 * Dead letter queue entry
 */
export interface DeadLetterEntry {
  id: string;
  timestamp: Date;
  record: unknown;
  error: Error;
  attempts: number;
  stage: string;
}