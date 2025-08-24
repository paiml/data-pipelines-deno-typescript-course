import { Result } from "../types/result.ts";

/**
 * Dead letter queue entry
 */
export interface DLQEntry<T = unknown> {
  id: string;
  payload: T;
  error: Error;
  originalQueue: string;
  timestamp: number;
  attemptCount: number;
  maxAttempts: number;
  nextRetryTime?: number;
  metadata?: Record<string, unknown>;
}

/**
 * DLQ processing result
 */
export interface DLQProcessingResult {
  processed: number;
  succeeded: number;
  failed: number;
  remaining: number;
  errors: Array<{
    entryId: string;
    error: Error;
  }>;
}

/**
 * DLQ configuration
 */
export interface DLQConfig {
  maxRetries?: number; // Maximum retry attempts for DLQ processing
  retryDelay?: number; // Delay between retry attempts (ms)
  batchSize?: number; // Number of entries to process at once
  ttl?: number; // Time to live for entries (ms)
  persistence?: "memory" | "file" | "database"; // Persistence strategy
  filePath?: string; // File path for file persistence
  autoProcess?: boolean; // Automatically process retryable entries
  processInterval?: number; // Auto-processing interval (ms)
}

/**
 * DLQ statistics
 */
export interface DLQStats {
  totalEntries: number;
  pendingEntries: number;
  retryableEntries: number;
  expiredEntries: number;
  processedToday: number;
  successRate: number;
  averageProcessingTime: number;
  oldestEntryAge?: number;
  entriesByQueue: Record<string, number>;
}

/**
 * Entry processor function
 */
export type EntryProcessor<T> = (entry: DLQEntry<T>) => Promise<Result<void, Error>>;

/**
 * Dead letter queue implementation for failed message handling
 */
export class DeadLetterQueue<T = unknown> {
  private entries = new Map<string, DLQEntry<T>>();
  private config: Required<DLQConfig>;
  private stats = {
    processedToday: 0,
    totalProcessingTime: 0,
    successfulProcessing: 0,
  };
  private processingTimer?: number;

  constructor(private name: string, config: DLQConfig = {}) {
    this.config = {
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 60_000, // 1 minute
      batchSize: config.batchSize ?? 10,
      ttl: config.ttl ?? 7 * 24 * 60 * 60 * 1000, // 7 days
      persistence: config.persistence ?? "memory",
      filePath: config.filePath ?? "./dlq.json",
      autoProcess: config.autoProcess ?? false,
      processInterval: config.processInterval ?? 5 * 60 * 1000, // 5 minutes
    };

    if (this.config.autoProcess) {
      this.startAutoProcessing();
    }
  }

  /**
   * Add entry to dead letter queue
   */
  async add(entry: Omit<DLQEntry<T>, 'id' | 'timestamp'>): Promise<Result<string, Error>> {
    try {
      const id = this.generateId();
      const dlqEntry: DLQEntry<T> = {
        ...entry,
        id,
        timestamp: Date.now(),
      };

      this.entries.set(id, dlqEntry);

      // Persist if needed
      if (this.config.persistence === "file") {
        await this.persistToFile();
      }

      return Result.ok(id);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Failed to add DLQ entry"));
    }
  }

  /**
   * Get entry by ID
   */
  async get(id: string): Promise<Result<DLQEntry<T> | null, Error>> {
    try {
      const entry = this.entries.get(id) || null;
      return Result.ok(entry);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Failed to get DLQ entry"));
    }
  }

  /**
   * Remove entry from DLQ
   */
  async remove(id: string): Promise<Result<boolean, Error>> {
    try {
      const removed = this.entries.delete(id);
      
      if (removed && this.config.persistence === "file") {
        await this.persistToFile();
      }

      return Result.ok(removed);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Failed to remove DLQ entry"));
    }
  }

  /**
   * Get entries ready for retry
   */
  async getRetryableEntries(): Promise<Result<DLQEntry<T>[], Error>> {
    try {
      const now = Date.now();
      const retryableEntries: DLQEntry<T>[] = [];

      for (const entry of this.entries.values()) {
        // Skip if max attempts reached
        if (entry.attemptCount >= entry.maxAttempts) {
          continue;
        }

        // Skip if still in retry delay
        if (entry.nextRetryTime && entry.nextRetryTime > now) {
          continue;
        }

        // Skip if expired
        if (this.isExpired(entry)) {
          continue;
        }

        retryableEntries.push(entry);
      }

      return Result.ok(retryableEntries);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Failed to get retryable entries"));
    }
  }

  /**
   * Process entries with custom processor
   */
  async process(
    processor: EntryProcessor<T>,
    batchSize?: number
  ): Promise<Result<DLQProcessingResult, Error>> {
    try {
      const retryableResult = await this.getRetryableEntries();
      if (Result.isErr(retryableResult)) {
        return Result.err(retryableResult.error);
      }

      const entries = retryableResult.value.slice(0, batchSize ?? this.config.batchSize);
      const result: DLQProcessingResult = {
        processed: 0,
        succeeded: 0,
        failed: 0,
        remaining: this.entries.size,
        errors: [],
      };

      const startTime = Date.now();

      for (const entry of entries) {
        result.processed++;
        
        try {
          const processResult = await processor(entry);
          
          if (Result.isOk(processResult)) {
            // Success - remove from DLQ
            await this.remove(entry.id);
            result.succeeded++;
            this.stats.successfulProcessing++;
          } else {
            // Failed - update for next retry
            await this.updateForRetry(entry, processResult.error);
            result.failed++;
            result.errors.push({
              entryId: entry.id,
              error: processResult.error,
            });
          }
        } catch (error) {
          // Unexpected error - update for next retry
          const processError = error instanceof Error ? error : new Error("Processing failed");
          await this.updateForRetry(entry, processError);
          result.failed++;
          result.errors.push({
            entryId: entry.id,
            error: processError,
          });
        }
      }

      const processingTime = Date.now() - startTime;
      this.stats.totalProcessingTime += processingTime;
      this.stats.processedToday += result.processed;
      
      result.remaining = this.entries.size;

      return Result.ok(result);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Failed to process DLQ entries"));
    }
  }

  /**
   * Clear expired entries
   */
  async clearExpired(): Promise<Result<number, Error>> {
    try {
      let clearedCount = 0;
      const expiredIds: string[] = [];

      for (const [id, entry] of this.entries.entries()) {
        if (this.isExpired(entry)) {
          expiredIds.push(id);
        }
      }

      for (const id of expiredIds) {
        this.entries.delete(id);
        clearedCount++;
      }

      if (clearedCount > 0 && this.config.persistence === "file") {
        await this.persistToFile();
      }

      return Result.ok(clearedCount);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Failed to clear expired entries"));
    }
  }

  /**
   * Get DLQ statistics
   */
  async getStats(): Promise<Result<DLQStats, Error>> {
    try {
      const now = Date.now();
      let retryableCount = 0;
      let expiredCount = 0;
      let oldestEntryAge: number | undefined;
      const entriesByQueue: Record<string, number> = {};

      for (const entry of this.entries.values()) {
        // Count by queue
        entriesByQueue[entry.originalQueue] = (entriesByQueue[entry.originalQueue] || 0) + 1;

        // Count retryable
        if (!this.isExpired(entry) && 
            entry.attemptCount < entry.maxAttempts &&
            (!entry.nextRetryTime || entry.nextRetryTime <= now)) {
          retryableCount++;
        }

        // Count expired
        if (this.isExpired(entry)) {
          expiredCount++;
        }

        // Track oldest
        const age = now - entry.timestamp;
        if (oldestEntryAge === undefined || age > oldestEntryAge) {
          oldestEntryAge = age;
        }
      }

      const successRate = this.stats.processedToday > 0 
        ? (this.stats.successfulProcessing / this.stats.processedToday) * 100
        : 0;

      const averageProcessingTime = this.stats.processedToday > 0
        ? this.stats.totalProcessingTime / this.stats.processedToday
        : 0;

      const stats: DLQStats = {
        totalEntries: this.entries.size,
        pendingEntries: this.entries.size - expiredCount,
        retryableEntries: retryableCount,
        expiredEntries: expiredCount,
        processedToday: this.stats.processedToday,
        successRate,
        averageProcessingTime,
        oldestEntryAge,
        entriesByQueue,
      };

      return Result.ok(stats);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Failed to get DLQ stats"));
    }
  }

  /**
   * List entries with filtering
   */
  async listEntries(filter?: {
    queue?: string;
    maxAge?: number;
    retryable?: boolean;
  }): Promise<Result<DLQEntry<T>[], Error>> {
    try {
      const now = Date.now();
      let filteredEntries = Array.from(this.entries.values());

      if (filter?.queue) {
        filteredEntries = filteredEntries.filter(entry => entry.originalQueue === filter.queue);
      }

      if (filter?.maxAge) {
        filteredEntries = filteredEntries.filter(entry => 
          (now - entry.timestamp) <= filter.maxAge!
        );
      }

      if (filter?.retryable !== undefined) {
        filteredEntries = filteredEntries.filter(entry => {
          const isRetryable = !this.isExpired(entry) && 
                             entry.attemptCount < entry.maxAttempts &&
                             (!entry.nextRetryTime || entry.nextRetryTime <= now);
          return filter.retryable ? isRetryable : !isRetryable;
        });
      }

      return Result.ok(filteredEntries);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Failed to list DLQ entries"));
    }
  }

  /**
   * Clear all entries
   */
  async clear(): Promise<Result<number, Error>> {
    try {
      const count = this.entries.size;
      this.entries.clear();

      if (this.config.persistence === "file") {
        await this.persistToFile();
      }

      return Result.ok(count);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Failed to clear DLQ"));
    }
  }

  /**
   * Start auto-processing
   */
  startAutoProcessing(): void {
    this.processingTimer = setInterval(async () => {
      // Auto-clear expired entries
      await this.clearExpired();
    }, this.config.processInterval);
  }

  /**
   * Stop auto-processing
   */
  stopAutoProcessing(): void {
    if (this.processingTimer) {
      clearInterval(this.processingTimer);
      this.processingTimer = undefined;
    }
  }

  /**
   * Close DLQ and cleanup resources
   */
  async close(): Promise<Result<void, Error>> {
    try {
      this.stopAutoProcessing();

      if (this.config.persistence === "file") {
        await this.persistToFile();
      }

      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Failed to close DLQ"));
    }
  }

  /**
   * Get DLQ name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Update entry for next retry
   */
  private async updateForRetry(entry: DLQEntry<T>, error: Error): Promise<void> {
    entry.attemptCount++;
    entry.error = error;
    entry.nextRetryTime = Date.now() + this.config.retryDelay;
    
    if (this.config.persistence === "file") {
      await this.persistToFile();
    }
  }

  /**
   * Check if entry is expired
   */
  private isExpired(entry: DLQEntry<T>): boolean {
    return (Date.now() - entry.timestamp) > this.config.ttl;
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `dlq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Persist to file (mock implementation for course)
   */
  private async persistToFile(): Promise<void> {
    if (this.config.persistence !== "file") return;
    
    try {
      const data = {
        entries: Array.from(this.entries.entries()),
        stats: this.stats,
        timestamp: Date.now(),
      };
      
      // In real implementation, would use Deno.writeTextFile
      console.log(`Would persist DLQ '${this.name}' to ${this.config.filePath}:`, {
        entriesCount: data.entries.length,
        timestamp: new Date(data.timestamp).toISOString(),
      });
    } catch (error) {
      console.error(`Failed to persist DLQ '${this.name}':`, error);
    }
  }

}

/**
 * DLQ Manager for handling multiple dead letter queues
 */
export class DLQManager {
  private queues = new Map<string, DeadLetterQueue<unknown>>();

  /**
   * Create or get DLQ
   */
  getOrCreateDLQ<T>(name: string, config?: DLQConfig): DeadLetterQueue<T> {
    let dlq = this.queues.get(name) as DeadLetterQueue<T>;
    
    if (!dlq) {
      dlq = new DeadLetterQueue<T>(name, config);
      this.queues.set(name, dlq as DeadLetterQueue<unknown>);
    }
    
    return dlq;
  }

  /**
   * Get DLQ by name
   */
  getDLQ<T>(name: string): DeadLetterQueue<T> | undefined {
    return this.queues.get(name) as DeadLetterQueue<T>;
  }

  /**
   * Remove DLQ
   */
  async removeDLQ(name: string): Promise<Result<boolean, Error>> {
    const dlq = this.queues.get(name);
    if (!dlq) {
      return Result.ok(false);
    }

    const closeResult = await dlq.close();
    if (Result.isErr(closeResult)) {
      return Result.err(closeResult.error);
    }

    this.queues.delete(name);
    return Result.ok(true);
  }

  /**
   * Get all DLQ names
   */
  getQueueNames(): string[] {
    return Array.from(this.queues.keys());
  }

  /**
   * Get aggregated statistics
   */
  async getAggregatedStats(): Promise<Result<Record<string, DLQStats>, Error>> {
    try {
      const stats: Record<string, DLQStats> = {};
      
      for (const [name, dlq] of this.queues.entries()) {
        const dlqStatsResult = await dlq.getStats();
        if (Result.isErr(dlqStatsResult)) {
          return Result.err(dlqStatsResult.error);
        }
        stats[name] = dlqStatsResult.value;
      }

      return Result.ok(stats);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Failed to get aggregated stats"));
    }
  }

  /**
   * Process all DLQs
   */
  async processAll<T>(
    processor: EntryProcessor<T>,
    batchSize?: number
  ): Promise<Result<Record<string, DLQProcessingResult>, Error>> {
    try {
      const results: Record<string, DLQProcessingResult> = {};
      
      for (const [name, dlq] of this.queues.entries()) {
        const processResult = await (dlq as DeadLetterQueue<T>).process(processor, batchSize);
        if (Result.isErr(processResult)) {
          return Result.err(processResult.error);
        }
        results[name] = processResult.value;
      }

      return Result.ok(results);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Failed to process all DLQs"));
    }
  }

  /**
   * Close all DLQs
   */
  async closeAll(): Promise<Result<void, Error>> {
    try {
      for (const dlq of this.queues.values()) {
        const closeResult = await dlq.close();
        if (Result.isErr(closeResult)) {
          return Result.err(closeResult.error);
        }
      }

      this.queues.clear();
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Failed to close all DLQs"));
    }
  }
}