import { Converter, ConverterConfig, ConverterMetadata, ConversionError, Result } from "../types/index.ts";
import { WorkerPool, WorkerTask, WorkerResult } from "./worker-pool.ts";

/**
 * Configuration for parallel converter
 */
export interface ParallelConverterConfig extends ConverterConfig {
  parallel?: {
    enabled?: boolean;
    maxWorkers?: number;
    batchSize?: number;
    taskTimeout?: number;
  };
}

/**
 * Parallel processing wrapper for converters
 */
export class ParallelConverter<TInput, TOutput> implements Converter<TInput[], TOutput[]> {
  private baseConverter: Converter<TInput, TOutput>;
  private workerPool: WorkerPool;
  private parallelConfig: Required<NonNullable<ParallelConverterConfig["parallel"]>>;

  constructor(
    baseConverter: Converter<TInput, TOutput>,
    workerPool?: WorkerPool,
    parallelConfig?: ParallelConverterConfig["parallel"]
  ) {
    this.baseConverter = baseConverter;
    this.workerPool = workerPool ?? new WorkerPool();
    
    this.parallelConfig = {
      enabled: parallelConfig?.enabled ?? true,
      maxWorkers: parallelConfig?.maxWorkers ?? navigator.hardwareConcurrency ?? 4,
      batchSize: parallelConfig?.batchSize ?? 100,
      taskTimeout: parallelConfig?.taskTimeout ?? 30_000,
    };
  }

  /**
   * Initialize parallel converter
   */
  async initialize(): Promise<Result<void, Error>> {
    return await this.workerPool.initialize();
  }

  /**
   * Convert array of inputs in parallel
   */
  async convert(
    inputs: TInput[],
    config?: ParallelConverterConfig,
  ): Promise<Result<TOutput[], ConversionError>> {
    // Check if parallel processing is enabled
    if (!this.parallelConfig.enabled || config?.parallel?.enabled === false || inputs.length === 1) {
      return await this.convertSequentially(inputs, config);
    }

    try {
      const batchSize = config?.parallel?.batchSize ?? this.parallelConfig.batchSize;
      const batches = this.createBatches(inputs, batchSize);
      const results: TOutput[] = [];

      // Process batches in parallel
      const batchPromises = batches.map((batch, batchIndex) => 
        this.processBatch(batch, batchIndex, config)
      );

      const batchResults = await Promise.all(batchPromises);

      // Aggregate results
      for (const batchResult of batchResults) {
        if (Result.isErr(batchResult)) {
          return Result.err(batchResult.error);
        }
        results.push(...batchResult.value);
      }

      return Result.ok(results);
    } catch (error) {
      return Result.err(
        new ConversionError(
          `Parallel conversion failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          "PARALLEL_PROCESSING_FAILED" as any,
          { inputs, error },
          false,
        ),
      );
    }
  }

  /**
   * Process single input (delegates to base converter)
   */
  async convertSingle(
    input: TInput,
    config?: ParallelConverterConfig,
  ): Promise<Result<TOutput, ConversionError>> {
    return await this.baseConverter.convert(input, config);
  }

  /**
   * Validate input array
   */
  validate(inputs: unknown): inputs is TInput[] {
    if (!Array.isArray(inputs)) {
      return false;
    }
    return inputs.every(input => this.baseConverter.validate(input));
  }

  /**
   * Get metadata with parallel info
   */
  getMetadata(): ConverterMetadata {
    const baseMetadata = this.baseConverter.getMetadata();
    
    return {
      ...baseMetadata,
      name: `Parallel ${baseMetadata.name}`,
      description: `${baseMetadata.description} (with parallel processing)`,
      features: [
        ...(baseMetadata.features || []),
        "parallel-processing",
        "batch-processing",
        "scalable"
      ],
      performanceTarget: {
        p50: Math.ceil((baseMetadata.performanceTarget?.p50 ?? 10) / this.parallelConfig.maxWorkers),
        p95: Math.ceil((baseMetadata.performanceTarget?.p95 ?? 20) / this.parallelConfig.maxWorkers),
        p99: Math.ceil((baseMetadata.performanceTarget?.p99 ?? 30) / this.parallelConfig.maxWorkers),
      }
    };
  }

  /**
   * Get parallel processing statistics
   */
  getParallelStats() {
    return this.workerPool.getStats();
  }

  /**
   * Get worker status
   */
  getWorkerStatus() {
    return this.workerPool.getWorkerStatus();
  }

  /**
   * Scale worker pool
   */
  async scaleWorkers(targetSize: number): Promise<Result<void, Error>> {
    return await this.workerPool.scaleWorkers(targetSize);
  }

  /**
   * Shutdown parallel converter
   */
  async shutdown(timeout?: number): Promise<Result<void, Error>> {
    return await this.workerPool.shutdown(timeout);
  }

  /**
   * Convert inputs sequentially (fallback)
   */
  private async convertSequentially(
    inputs: TInput[],
    config?: ParallelConverterConfig,
  ): Promise<Result<TOutput[], ConversionError>> {
    const results: TOutput[] = [];

    for (const input of inputs) {
      const result = await this.baseConverter.convert(input, config);
      if (Result.isErr(result)) {
        return Result.err(result.error);
      }
      results.push(result.value);
    }

    return Result.ok(results);
  }

  /**
   * Create batches from input array
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Process a batch of inputs
   */
  private async processBatch(
    batch: TInput[],
    batchIndex: number,
    config?: ParallelConverterConfig,
  ): Promise<Result<TOutput[], ConversionError>> {
    try {
      // Create tasks for worker pool
      const tasks: WorkerTask<TInput, TOutput>[] = batch.map((input, index) => ({
        id: `batch-${batchIndex}-item-${index}-${Date.now()}`,
        type: "conversion",
        input,
        timeout: config?.parallel?.taskTimeout ?? this.parallelConfig.taskTimeout,
        priority: 1,
      }));

      // Submit batch to worker pool
      const workerResults = await this.workerPool.submitBatch(tasks);

      if (Result.isErr(workerResults)) {
        return Result.err(
          new ConversionError(
            `Batch ${batchIndex} processing failed: ${workerResults.error.message}`,
            "BATCH_PROCESSING_FAILED" as any,
            { batch, batchIndex, error: workerResults.error },
            false,
          ),
        );
      }

      // Extract outputs from worker results
      const outputs: TOutput[] = [];
      const errors: string[] = [];

      for (const workerResult of workerResults.value) {
        if (workerResult.success && workerResult.output !== undefined) {
          outputs.push(workerResult.output);
        } else {
          errors.push(workerResult.error || "Unknown worker error");
        }
      }

      if (errors.length > 0) {
        return Result.err(
          new ConversionError(
            `Batch ${batchIndex} had ${errors.length} failures: ${errors.join(", ")}`,
            "BATCH_PARTIAL_FAILURE" as any,
            { batch, batchIndex, errors },
            false,
          ),
        );
      }

      return Result.ok(outputs);
    } catch (error) {
      return Result.err(
        new ConversionError(
          `Batch ${batchIndex} processing error: ${error instanceof Error ? error.message : "Unknown error"}`,
          "BATCH_ERROR" as any,
          { batch, batchIndex, error },
          false,
        ),
      );
    }
  }

  /**
   * Get optimal batch size based on input size and worker count
   */
  getOptimalBatchSize(inputSize: number): number {
    const workers = this.workerPool.getStats().activeWorkers || this.parallelConfig.maxWorkers;
    
    // Aim for 2-4 batches per worker to allow for load balancing
    const targetBatchesPerWorker = 3;
    const optimalBatches = workers * targetBatchesPerWorker;
    
    return Math.max(1, Math.ceil(inputSize / optimalBatches));
  }

  /**
   * Auto-scale workers based on workload
   */
  async autoScale(inputSize: number): Promise<Result<void, Error>> {
    const stats = this.workerPool.getStats();
    const currentWorkers = stats.activeWorkers;
    
    // Simple auto-scaling logic
    let targetWorkers = currentWorkers;
    
    if (inputSize > 1000 && currentWorkers < this.parallelConfig.maxWorkers) {
      // Scale up for large workloads
      targetWorkers = Math.min(this.parallelConfig.maxWorkers, Math.ceil(inputSize / 250));
    } else if (inputSize < 100 && currentWorkers > 2) {
      // Scale down for small workloads
      targetWorkers = Math.max(2, Math.ceil(currentWorkers / 2));
    }
    
    if (targetWorkers !== currentWorkers) {
      return await this.scaleWorkers(targetWorkers);
    }
    
    return Result.ok(undefined);
  }

  /**
   * Get estimated processing time
   */
  getEstimatedProcessingTime(inputSize: number): number {
    const metadata = this.getMetadata();
    const avgTimePerItem = metadata.performanceTarget?.p50 ?? 10;
    const workers = this.workerPool.getStats().activeWorkers || this.parallelConfig.maxWorkers;
    
    // Estimate time with parallel processing
    const batchSize = this.getOptimalBatchSize(inputSize);
    const totalBatches = Math.ceil(inputSize / batchSize);
    const batchesPerWorker = Math.ceil(totalBatches / workers);
    
    return batchesPerWorker * batchSize * avgTimePerItem;
  }
}