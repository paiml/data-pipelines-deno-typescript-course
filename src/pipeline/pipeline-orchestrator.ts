import { Result } from "../shared/types/result.ts";
import { Converter } from "../shared/types/converter.ts";
import { CacheManager } from "../shared/cache/cache-manager.ts";
import { MetricsCollector } from "../shared/monitoring/metrics.ts";
import { CircuitBreaker } from "../shared/resilience/circuit-breaker.ts";
import { RetryPolicy } from "../shared/resilience/retry-policy.ts";
import { DeadLetterQueue } from "../shared/resilience/dead-letter-queue.ts";
import { WorkerPool } from "../shared/workers/worker-pool.ts";

// Import all converters
import { EurToUsdConverter } from "../converters/currency/eur-to-usd.ts";
import { MetricToImperialConverter } from "../converters/units/metric-to-imperial.ts";
import { EuToUsaDateConverter } from "../converters/dates/eu-to-usa-date.ts";
import { EuToUsaNumberConverter } from "../converters/formats/eu-to-usa-number.ts";
import { EuToUsaAddressConverter } from "../converters/addresses/eu-to-usa-address.ts";
import { EuToUsaPhoneConverter } from "../converters/phone/eu-to-usa-phone.ts";
import { VatToSalesTaxConverter } from "../converters/tax/vat-to-sales-tax.ts";
import { GdprToCcpaConverter } from "../converters/privacy/gdpr-to-ccpa.ts";

/**
 * Pipeline stage configuration
 */
export interface PipelineStage {
  name: string;
  converter: Converter<any, any>;
  required: boolean;
  parallel?: boolean;
  timeout?: number;
  retryPolicy?: RetryPolicy;
}

/**
 * Pipeline configuration
 */
export interface PipelineConfig {
  name: string;
  stages: PipelineStage[];
  enableCache?: boolean;
  enableMetrics?: boolean;
  enableCircuitBreaker?: boolean;
  enableDeadLetterQueue?: boolean;
  parallelism?: number;
  timeout?: number;
}

/**
 * Pipeline execution result
 */
export interface PipelineResult {
  id: string;
  name: string;
  startTime: number;
  endTime: number;
  duration: number;
  stages: StageResult[];
  success: boolean;
  errors: string[];
}

/**
 * Individual stage result
 */
export interface StageResult {
  name: string;
  success: boolean;
  duration: number;
  input: any;
  output?: any;
  error?: string;
  cached?: boolean;
  retries?: number;
}

/**
 * EU to USA data record
 */
export interface EUDataRecord {
  id: string;
  currency?: { amount: number };
  measurements?: Array<{ value: number; unit: string }>;
  dates?: string[];
  numbers?: string[];
  address?: {
    street: string;
    houseNumber: string;
    postalCode: string;
    city: string;
    country: string;
  };
  phone?: string;
  vat?: {
    amount: number;
    rate: number;
    country: string;
  };
  privacy?: {
    requestType: "access" | "deletion" | "portability" | "rectification";
    dataCategories: string[];
    purposes: string[];
  };
}

/**
 * USA data record after conversion
 */
export interface USADataRecord {
  id: string;
  currency?: { amount: number; currency: string };
  measurements?: Array<{ value: number; unit: string }>;
  dates?: string[];
  numbers?: string[];
  address?: {
    streetNumber: string;
    streetName: string;
    city: string;
    state: string;
    zipCode: string;
  };
  phone?: string;
  salesTax?: {
    subtotal: number;
    taxAmount: number;
    total: number;
    state: string;
  };
  privacy?: {
    requestType: string;
    rights: string[];
    disclosures: string[];
  };
}

/**
 * Main pipeline orchestrator for EU to USA data conversion
 */
export class PipelineOrchestrator {
  private cache: CacheManager;
  private metrics: MetricsCollector;
  private circuitBreakers: Map<string, CircuitBreaker>;
  private deadLetterQueue: DeadLetterQueue;
  private workerPool?: WorkerPool;
  private converters: Map<string, Converter<any, any>>;

  constructor(private config: PipelineConfig) {
    this.cache = new CacheManager();
    this.metrics = new MetricsCollector();
    this.circuitBreakers = new Map();
    this.deadLetterQueue = new DeadLetterQueue();
    this.converters = new Map();
    
    if (config.parallelism && config.parallelism > 1) {
      this.workerPool = new WorkerPool(config.parallelism);
    }

    this.initializeConverters();
    this.initializeCircuitBreakers();
  }

  /**
   * Initialize all converters
   */
  private initializeConverters(): void {
    this.converters.set("currency", new EurToUsdConverter({}));
    this.converters.set("units", new MetricToImperialConverter({}));
    this.converters.set("dates", new EuToUsaDateConverter({}));
    this.converters.set("numbers", new EuToUsaNumberConverter({}));
    this.converters.set("address", new EuToUsaAddressConverter({}));
    this.converters.set("phone", new EuToUsaPhoneConverter({}));
    this.converters.set("tax", new VatToSalesTaxConverter({}));
    this.converters.set("privacy", new GdprToCcpaConverter({}));
  }

  /**
   * Initialize circuit breakers for each stage
   */
  private initializeCircuitBreakers(): void {
    if (!this.config.enableCircuitBreaker) return;

    for (const stage of this.config.stages) {
      this.circuitBreakers.set(
        stage.name,
        new CircuitBreaker(stage.name, {
          failureThreshold: 5,
          resetTimeout: 60000,
          halfOpenRequests: 3,
        })
      );
    }
  }

  /**
   * Process a single EU data record through the pipeline
   */
  async processRecord(record: EUDataRecord): Promise<Result<USADataRecord, string>> {
    const pipelineId = `pipeline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    const stageResults: StageResult[] = [];
    const errors: string[] = [];

    try {
      // Start pipeline metrics
      if (this.config.enableMetrics) {
        this.metrics.incrementCounter("pipeline_requests_total", 1, { pipeline: this.config.name });
      }

      // Convert the record
      const usaRecord: USADataRecord = { id: record.id };

      // Process each stage
      for (const stage of this.config.stages) {
        const stageResult = await this.processStage(stage, record, usaRecord);
        stageResults.push(stageResult);

        if (!stageResult.success && stage.required) {
          errors.push(`Stage ${stage.name} failed: ${stageResult.error}`);
          
          if (this.config.enableDeadLetterQueue) {
            await this.deadLetterQueue.add({
              id: pipelineId,
              data: record,
              error: new Error(stageResult.error || "Unknown error"),
              timestamp: Date.now(),
              retries: 0,
            });
          }

          return Result.err(`Pipeline failed at stage ${stage.name}: ${stageResult.error}`);
        }
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Record success metrics
      if (this.config.enableMetrics) {
        this.metrics.incrementCounter("pipeline_success_total", 1, { pipeline: this.config.name });
        this.metrics.observeHistogram("pipeline_duration_ms", duration, { pipeline: this.config.name });
      }

      // Create pipeline result
      const pipelineResult: PipelineResult = {
        id: pipelineId,
        name: this.config.name,
        startTime,
        endTime,
        duration,
        stages: stageResults,
        success: true,
        errors,
      };

      // Cache successful result
      if (this.config.enableCache) {
        const cacheKey = `pipeline:${this.config.name}:${record.id}`;
        this.cache.set(cacheKey, pipelineResult, 300);
      }

      return Result.ok(usaRecord);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      
      if (this.config.enableMetrics) {
        this.metrics.incrementCounter("pipeline_errors_total", 1, { error: errorMessage });
      }

      return Result.err(`Pipeline execution failed: ${errorMessage}`);
    }
  }

  /**
   * Process a single pipeline stage
   */
  private async processStage(
    stage: PipelineStage,
    euRecord: EUDataRecord,
    usaRecord: USADataRecord
  ): Promise<StageResult> {
    const startTime = Date.now();

    try {
      // Check cache
      if (this.config.enableCache) {
        const cacheKey = `stage:${stage.name}:${euRecord.id}`;
        const cached = this.cache.get(cacheKey);
        if (cached) {
          if (this.config.enableMetrics) {
            this.metrics.incrementCounter("cache_hits_total", 1, { stage: stage.name });
          }
          return {
            name: stage.name,
            success: true,
            duration: Date.now() - startTime,
            input: this.getStageInput(stage.name, euRecord),
            output: cached,
            cached: true,
          };
        }
      }

      // Get circuit breaker if enabled
      const circuitBreaker = this.config.enableCircuitBreaker
        ? this.circuitBreakers.get(stage.name)
        : undefined;

      // Execute stage with resilience patterns
      const executeStage = async () => {
        const input = this.getStageInput(stage.name, euRecord);
        if (!input) {
          return { skipped: true };
        }

        const result = await stage.converter.convert(input);
        if (Result.isOk(result)) {
          this.applyStageOutput(stage.name, usaRecord, result.value);
          return result.value;
        } else {
          throw new Error(result.error);
        }
      };

      let output: any;
      let retries = 0;

      if (circuitBreaker) {
        output = await circuitBreaker.execute(executeStage);
      } else if (stage.retryPolicy) {
        const retryResult = await stage.retryPolicy.execute(executeStage);
        output = retryResult;
        retries = stage.retryPolicy.getMetrics().totalAttempts - 1;
      } else {
        output = await executeStage();
      }

      // Skip if no input data
      if (output?.skipped) {
        return {
          name: stage.name,
          success: true,
          duration: Date.now() - startTime,
          input: null,
          output: null,
        };
      }

      // Cache successful result
      if (this.config.enableCache) {
        const cacheKey = `stage:${stage.name}:${euRecord.id}`;
        this.cache.set(cacheKey, output, 300);
      }

      return {
        name: stage.name,
        success: true,
        duration: Date.now() - startTime,
        input: this.getStageInput(stage.name, euRecord),
        output,
        retries,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      
      if (this.config.enableMetrics) {
        this.metrics.incrementCounter("stage_errors_total", 1, { stage: stage.name });
      }

      return {
        name: stage.name,
        success: false,
        duration: Date.now() - startTime,
        input: this.getStageInput(stage.name, euRecord),
        error: errorMessage,
      };
    }
  }

  /**
   * Get input data for a specific stage
   */
  private getStageInput(stageName: string, record: EUDataRecord): any {
    switch (stageName) {
      case "currency":
        return record.currency;
      case "units":
        return record.measurements?.[0]; // Process first measurement
      case "dates":
        return record.dates?.[0] ? { date: record.dates[0] } : null;
      case "numbers":
        return record.numbers?.[0] ? { number: record.numbers[0] } : null;
      case "address":
        return record.address;
      case "phone":
        return record.phone ? { phone: record.phone } : null;
      case "tax":
        return record.vat;
      case "privacy":
        return record.privacy;
      default:
        return null;
    }
  }

  /**
   * Apply stage output to USA record
   */
  private applyStageOutput(stageName: string, record: USADataRecord, output: any): void {
    switch (stageName) {
      case "currency":
        record.currency = output;
        break;
      case "units":
        if (!record.measurements) record.measurements = [];
        record.measurements.push(output);
        break;
      case "dates":
        if (!record.dates) record.dates = [];
        record.dates.push(output.date);
        break;
      case "numbers":
        if (!record.numbers) record.numbers = [];
        record.numbers.push(output.number);
        break;
      case "address":
        record.address = output;
        break;
      case "phone":
        record.phone = output.formatted;
        break;
      case "tax":
        record.salesTax = output;
        break;
      case "privacy":
        record.privacy = output;
        break;
    }
  }

  /**
   * Process multiple records in batch
   */
  async processBatch(
    records: EUDataRecord[]
  ): Promise<Result<USADataRecord[], string>> {
    const results: USADataRecord[] = [];
    const errors: string[] = [];

    try {
      // Process in parallel if worker pool is available
      if (this.workerPool) {
        const tasks = records.map(record => () => this.processRecord(record));
        const batchResults = await Promise.all(
          tasks.map(task => this.workerPool!.execute(task))
        );

        for (const result of batchResults) {
          if (Result.isOk(result)) {
            results.push(result.value);
          } else {
            errors.push(result.error);
          }
        }
      } else {
        // Process sequentially
        for (const record of records) {
          const result = await this.processRecord(record);
          if (Result.isOk(result)) {
            results.push(result.value);
          } else {
            errors.push(result.error);
          }
        }
      }

      if (errors.length > 0) {
        return Result.err(`Batch processing had ${errors.length} errors: ${errors.join(", ")}`);
      }

      return Result.ok(results);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return Result.err(`Batch processing failed: ${errorMessage}`);
    }
  }

  /**
   * Process failed messages from dead letter queue
   */
  async processDeadLetterQueue(): Promise<void> {
    if (!this.config.enableDeadLetterQueue) {
      return;
    }

    const messages = this.deadLetterQueue.getMessages(10);
    
    for (const message of messages) {
      if (message.retries < 3) {
        const result = await this.processRecord(message.data as EUDataRecord);
        
        if (Result.isOk(result)) {
          this.deadLetterQueue.remove(message.id);
        } else {
          message.retries++;
          message.lastError = result.error;
        }
      }
    }
  }

  /**
   * Get pipeline metrics
   */
  getMetrics(): any {
    return {
      cache: {
        size: this.cache.size(),
        stats: this.cache.getStats(),
      },
      metrics: this.config.enableMetrics 
        ? this.metrics.exportPrometheus()
        : null,
      circuitBreakers: this.config.enableCircuitBreaker
        ? Array.from(this.circuitBreakers.entries()).map(([name, cb]) => ({
            name,
            state: cb.getState(),
            metrics: cb.getMetrics(),
          }))
        : null,
      deadLetterQueue: this.config.enableDeadLetterQueue
        ? {
            size: this.deadLetterQueue.size(),
            oldest: this.deadLetterQueue.getOldest(),
          }
        : null,
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.workerPool) {
      this.workerPool.terminate();
    }
    
    this.cache.clear();
    this.deadLetterQueue.clear();
    
    // Reset circuit breakers
    for (const cb of this.circuitBreakers.values()) {
      cb.reset();
    }
  }
}

/**
 * Create a default pipeline with all converters
 */
export function createDefaultPipeline(): PipelineOrchestrator {
  const retryPolicy = new RetryPolicy({
    strategy: "exponential",
    maxAttempts: 3,
    initialDelay: 100,
  });

  const config: PipelineConfig = {
    name: "eu-to-usa-complete",
    stages: [
      {
        name: "currency",
        converter: new EurToUsdConverter({}),
        required: false,
        retryPolicy,
      },
      {
        name: "units",
        converter: new MetricToImperialConverter({}),
        required: false,
      },
      {
        name: "dates",
        converter: new EuToUsaDateConverter({}),
        required: false,
      },
      {
        name: "numbers",
        converter: new EuToUsaNumberConverter({}),
        required: false,
      },
      {
        name: "address",
        converter: new EuToUsaAddressConverter({}),
        required: false,
        retryPolicy,
      },
      {
        name: "phone",
        converter: new EuToUsaPhoneConverter({}),
        required: false,
      },
      {
        name: "tax",
        converter: new VatToSalesTaxConverter({}),
        required: false,
        retryPolicy,
      },
      {
        name: "privacy",
        converter: new GdprToCcpaConverter({}),
        required: false,
      },
    ],
    enableCache: true,
    enableMetrics: true,
    enableCircuitBreaker: true,
    enableDeadLetterQueue: true,
    parallelism: 4,
    timeout: 30000,
  };

  return new PipelineOrchestrator(config);
}