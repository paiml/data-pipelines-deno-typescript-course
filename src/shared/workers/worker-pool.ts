import { Result } from "../types/result.ts";

/**
 * Worker task interface
 */
export interface WorkerTask<TInput = any, TOutput = any> {
  id: string;
  type: string;
  input: TInput;
  timeout?: number;
  priority?: number;
}

/**
 * Worker result interface
 */
export interface WorkerResult<TOutput = any> {
  taskId: string;
  success: boolean;
  output?: TOutput;
  error?: string;
  executionTime: number;
}

/**
 * Worker configuration
 */
export interface WorkerConfig {
  maxWorkers?: number;
  taskTimeout?: number;
  workerScript?: string;
  idleTimeout?: number;
  retryAttempts?: number;
}

/**
 * Worker pool for parallel processing
 */
export class WorkerPool {
  private workers = new Map<string, Worker>();
  private availableWorkers = new Set<string>();
  private busyWorkers = new Set<string>();
  private taskQueue: WorkerTask[] = [];
  private pendingTasks = new Map<string, {
    task: WorkerTask;
    resolve: (result: WorkerResult) => void;
    reject: (error: Error) => void;
    timeout?: number;
  }>();
  
  private config: Required<WorkerConfig>;
  private isShuttingDown = false;
  private stats = {
    tasksCompleted: 0,
    tasksQueued: 0,
    tasksFailed: 0,
    averageExecutionTime: 0,
    peakQueueSize: 0,
  };

  constructor(config: WorkerConfig = {}) {
    this.config = {
      maxWorkers: config.maxWorkers ?? navigator.hardwareConcurrency ?? 4,
      taskTimeout: config.taskTimeout ?? 30_000, // 30 seconds
      workerScript: config.workerScript ?? "./worker.ts",
      idleTimeout: config.idleTimeout ?? 300_000, // 5 minutes
      retryAttempts: config.retryAttempts ?? 3,
    };
  }

  /**
   * Initialize worker pool
   */
  async initialize(): Promise<Result<void, Error>> {
    try {
      // Create initial workers
      for (let i = 0; i < Math.min(2, this.config.maxWorkers); i++) {
        await this.createWorker();
      }
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Worker pool init failed"));
    }
  }

  /**
   * Submit task for processing
   */
  async submitTask<TInput, TOutput>(
    task: WorkerTask<TInput, TOutput>
  ): Promise<Result<TOutput, Error>> {
    if (this.isShuttingDown) {
      return Result.err(new Error("Worker pool is shutting down"));
    }

    return new Promise((resolve) => {
      const handleResult = (result: WorkerResult<TOutput>) => {
        if (result.success) {
          resolve(Result.ok(result.output!));
        } else {
          resolve(Result.err(new Error(result.error || "Task failed")));
        }
      };

      const handleError = (error: Error) => {
        resolve(Result.err(error));
      };

      // Add task to pending
      this.pendingTasks.set(task.id, {
        task,
        resolve: handleResult,
        reject: handleError,
        timeout: task.timeout ?? this.config.taskTimeout,
      });

      // Try to process immediately or queue
      this.processTask(task);
    });
  }

  /**
   * Submit multiple tasks in batch
   */
  async submitBatch<TInput, TOutput>(
    tasks: WorkerTask<TInput, TOutput>[]
  ): Promise<Result<WorkerResult<TOutput>[], Error>> {
    try {
      const promises = tasks.map(task => this.submitTask(task));
      const results = await Promise.all(promises);
      
      const batchResults: WorkerResult<TOutput>[] = [];
      const errors: Error[] = [];

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (Result.isOk(result)) {
          batchResults.push({
            taskId: tasks[i].id,
            success: true,
            output: result.value,
            executionTime: 0, // Will be set by worker
          });
        } else {
          errors.push(result.error);
          batchResults.push({
            taskId: tasks[i].id,
            success: false,
            error: result.error.message,
            executionTime: 0,
          });
        }
      }

      if (errors.length === results.length) {
        return Result.err(new Error(`All batch tasks failed: ${errors.map(e => e.message).join(", ")}`));
      }

      return Result.ok(batchResults);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Batch processing failed"));
    }
  }

  /**
   * Get worker pool statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeWorkers: this.workers.size,
      availableWorkers: this.availableWorkers.size,
      busyWorkers: this.busyWorkers.size,
      queuedTasks: this.taskQueue.length,
      pendingTasks: this.pendingTasks.size,
    };
  }

  /**
   * Get detailed worker status
   */
  getWorkerStatus() {
    return {
      total: this.workers.size,
      available: Array.from(this.availableWorkers),
      busy: Array.from(this.busyWorkers),
      maxWorkers: this.config.maxWorkers,
    };
  }

  /**
   * Shutdown worker pool gracefully
   */
  async shutdown(forceTimeout: number = 30_000): Promise<Result<void, Error>> {
    try {
      this.isShuttingDown = true;

      // Wait for pending tasks with timeout
      const shutdownPromise = this.waitForPendingTasks();
      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error("Shutdown timeout")), forceTimeout);
      });

      try {
        await Promise.race([shutdownPromise, timeoutPromise]);
      } catch (error) {
        console.warn("Forced shutdown due to timeout");
      }

      // Terminate all workers
      for (const worker of this.workers.values()) {
        worker.terminate();
      }

      this.workers.clear();
      this.availableWorkers.clear();
      this.busyWorkers.clear();
      this.taskQueue.length = 0;
      this.pendingTasks.clear();

      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Shutdown failed"));
    }
  }

  /**
   * Scale worker pool size
   */
  async scaleWorkers(targetSize: number): Promise<Result<void, Error>> {
    try {
      targetSize = Math.max(1, Math.min(targetSize, this.config.maxWorkers));
      const currentSize = this.workers.size;

      if (targetSize > currentSize) {
        // Add workers
        const toAdd = targetSize - currentSize;
        for (let i = 0; i < toAdd; i++) {
          await this.createWorker();
        }
      } else if (targetSize < currentSize) {
        // Remove workers
        const toRemove = currentSize - targetSize;
        const availableWorkers = Array.from(this.availableWorkers);
        
        for (let i = 0; i < Math.min(toRemove, availableWorkers.length); i++) {
          const workerId = availableWorkers[i];
          await this.removeWorker(workerId);
        }
      }

      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Worker scaling failed"));
    }
  }

  /**
   * Create a new worker
   */
  private async createWorker(): Promise<string> {
    const workerId = `worker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Mock worker creation for course demonstration
    // In production, this would create actual Web Workers
    const mockWorker = {
      postMessage: (message: any) => {
        // Simulate async task processing
        setTimeout(() => {
          this.handleWorkerMessage(workerId, {
            type: "result",
            taskId: message.task.id,
            success: true,
            output: `Processed: ${JSON.stringify(message.task.input)}`,
            executionTime: Math.random() * 1000,
          });
        }, 10 + Math.random() * 100);
      },
      terminate: () => {
        // Mock termination
      },
    } as Worker;

    this.workers.set(workerId, mockWorker);
    this.availableWorkers.add(workerId);

    return workerId;
  }

  /**
   * Remove a worker
   */
  private async removeWorker(workerId: string): Promise<void> {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.terminate();
      this.workers.delete(workerId);
      this.availableWorkers.delete(workerId);
      this.busyWorkers.delete(workerId);
    }
  }

  /**
   * Process a task
   */
  private async processTask(task: WorkerTask): Promise<void> {
    // Update queue stats
    this.stats.tasksQueued++;
    this.stats.peakQueueSize = Math.max(this.stats.peakQueueSize, this.taskQueue.length + 1);

    // Check if we have available workers
    if (this.availableWorkers.size === 0) {
      // Try to scale up if possible
      if (this.workers.size < this.config.maxWorkers) {
        await this.createWorker();
      } else {
        // Queue the task
        this.taskQueue.push(task);
        return;
      }
    }

    // Assign to available worker
    const workerId = Array.from(this.availableWorkers)[0];
    this.assignTaskToWorker(workerId, task);
  }

  /**
   * Assign task to specific worker
   */
  private assignTaskToWorker(workerId: string, task: WorkerTask): void {
    const worker = this.workers.get(workerId);
    if (!worker) {
      this.handleTaskError(task.id, new Error("Worker not found"));
      return;
    }

    // Move worker to busy state
    this.availableWorkers.delete(workerId);
    this.busyWorkers.add(workerId);

    // Send task to worker
    worker.postMessage({
      type: "task",
      task,
    });

    // Set timeout for task
    const pendingTask = this.pendingTasks.get(task.id);
    if (pendingTask?.timeout) {
      setTimeout(() => {
        if (this.pendingTasks.has(task.id)) {
          this.handleTaskError(task.id, new Error("Task timeout"));
        }
      }, pendingTask.timeout);
    }
  }

  /**
   * Handle worker message
   */
  private handleWorkerMessage(workerId: string, message: any): void {
    if (message.type === "result") {
      this.handleTaskResult(workerId, message);
    } else if (message.type === "error") {
      this.handleTaskError(message.taskId, new Error(message.error));
    }
  }

  /**
   * Handle task result
   */
  private handleTaskResult(workerId: string, result: WorkerResult): void {
    const pendingTask = this.pendingTasks.get(result.taskId);
    if (!pendingTask) {
      return;
    }

    // Update statistics
    this.stats.tasksCompleted++;
    if (result.success) {
      this.stats.averageExecutionTime = 
        (this.stats.averageExecutionTime * (this.stats.tasksCompleted - 1) + result.executionTime) / 
        this.stats.tasksCompleted;
    } else {
      this.stats.tasksFailed++;
    }

    // Resolve pending task
    pendingTask.resolve(result);
    this.pendingTasks.delete(result.taskId);

    // Move worker back to available state
    this.busyWorkers.delete(workerId);
    this.availableWorkers.add(workerId);

    // Process next queued task if any
    if (this.taskQueue.length > 0) {
      const nextTask = this.taskQueue.shift()!;
      this.assignTaskToWorker(workerId, nextTask);
    }
  }

  /**
   * Handle task error
   */
  private handleTaskError(taskId: string, error: Error): void {
    const pendingTask = this.pendingTasks.get(taskId);
    if (!pendingTask) {
      return;
    }

    this.stats.tasksFailed++;
    pendingTask.reject(error);
    this.pendingTasks.delete(taskId);
  }

  /**
   * Wait for all pending tasks to complete
   */
  private async waitForPendingTasks(): Promise<void> {
    while (this.pendingTasks.size > 0 || this.taskQueue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Terminate all workers and clean up resources
   */
  terminate(): void {
    this.isShuttingDown = true;
    
    // Terminate all workers
    for (const [workerId, worker] of this.workers) {
      worker.terminate();
    }
    
    // Clear all collections
    this.workers.clear();
    this.availableWorkers.clear();
    this.busyWorkers.clear();
    this.taskQueue = [];
    
    // Reject all pending tasks
    for (const [_, pendingTask] of this.pendingTasks) {
      pendingTask.reject(new Error("Worker pool terminated"));
    }
    this.pendingTasks.clear();
  }
}