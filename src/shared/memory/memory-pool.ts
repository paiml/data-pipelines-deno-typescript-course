import { Result } from "../types/result.ts";

/**
 * Memory pool configuration
 */
export interface MemoryPoolConfig {
  initialSize?: number;
  maxSize?: number;
  chunkSize?: number;
  growthFactor?: number;
  shrinkThreshold?: number;
}

/**
 * Memory chunk info
 */
export interface MemoryChunk {
  id: string;
  size: number;
  allocated: boolean;
  data: ArrayBuffer;
  timestamp: number;
}

/**
 * Memory pool statistics
 */
export interface MemoryPoolStats {
  totalSize: number;
  allocatedSize: number;
  freeSize: number;
  chunkCount: number;
  allocatedChunks: number;
  freeChunks: number;
  fragmentation: number;
  allocations: number;
  deallocations: number;
}

/**
 * Memory pool for efficient buffer management
 */
export class MemoryPool {
  private chunks = new Map<string, MemoryChunk>();
  private freeChunks = new Set<string>();
  private config: Required<MemoryPoolConfig>;
  private stats: MemoryPoolStats;
  private nextChunkId = 0;

  constructor(config: MemoryPoolConfig = {}) {
    this.config = {
      initialSize: config.initialSize ?? 1024 * 1024, // 1MB
      maxSize: config.maxSize ?? 100 * 1024 * 1024, // 100MB
      chunkSize: config.chunkSize ?? 64 * 1024, // 64KB
      growthFactor: config.growthFactor ?? 2,
      shrinkThreshold: config.shrinkThreshold ?? 0.25, // Shrink when 75% free
    };

    this.stats = {
      totalSize: 0,
      allocatedSize: 0,
      freeSize: 0,
      chunkCount: 0,
      allocatedChunks: 0,
      freeChunks: 0,
      fragmentation: 0,
      allocations: 0,
      deallocations: 0,
    };

    this.initialize();
  }

  /**
   * Initialize memory pool
   */
  private initialize(): void {
    const initialChunks = Math.ceil(this.config.initialSize / this.config.chunkSize);
    
    for (let i = 0; i < initialChunks; i++) {
      this.createChunk();
    }

    this.updateStats();
  }

  /**
   * Allocate memory chunk
   */
  allocate(size: number): Result<ArrayBuffer, Error> {
    try {
      // Find suitable free chunk
      let chunkId = this.findFreeChunk(size);
      
      if (!chunkId) {
        // Try to grow pool if within limits
        if (this.canGrow()) {
          this.growPool();
          chunkId = this.findFreeChunk(size);
        }
      }

      if (!chunkId) {
        return Result.err(new Error("Out of memory - cannot allocate chunk"));
      }

      const chunk = this.chunks.get(chunkId)!;
      chunk.allocated = true;
      chunk.timestamp = Date.now();
      this.freeChunks.delete(chunkId);

      this.stats.allocations++;
      this.updateStats();

      // Return a view of the requested size
      return Result.ok(chunk.data.slice(0, size));
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Allocation failed"));
    }
  }

  /**
   * Deallocate memory chunk
   */
  deallocate(buffer: ArrayBuffer): Result<void, Error> {
    try {
      // Find chunk by buffer reference (simplified approach)
      const chunkId = this.findChunkByBuffer(buffer);
      
      if (!chunkId) {
        return Result.err(new Error("Buffer not found in pool"));
      }

      const chunk = this.chunks.get(chunkId)!;
      chunk.allocated = false;
      chunk.timestamp = Date.now();
      this.freeChunks.add(chunkId);

      this.stats.deallocations++;
      this.updateStats();

      // Consider shrinking if pool is underutilized
      if (this.shouldShrink()) {
        this.shrinkPool();
      }

      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Deallocation failed"));
    }
  }

  /**
   * Get memory pool statistics
   */
  getStats(): MemoryPoolStats {
    this.updateStats();
    return { ...this.stats };
  }

  /**
   * Clear all allocated memory (force deallocation)
   */
  clear(): Result<void, Error> {
    try {
      for (const chunk of this.chunks.values()) {
        chunk.allocated = false;
        this.freeChunks.add(chunk.id);
      }

      this.updateStats();
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Clear failed"));
    }
  }

  /**
   * Resize memory pool
   */
  resize(newMaxSize: number): Result<void, Error> {
    try {
      if (newMaxSize < this.stats.allocatedSize) {
        return Result.err(new Error("Cannot resize below currently allocated size"));
      }

      this.config.maxSize = newMaxSize;

      // Shrink if necessary
      while (this.stats.totalSize > newMaxSize && this.freeChunks.size > 0) {
        const chunkId = Array.from(this.freeChunks)[0];
        this.removeChunk(chunkId);
      }

      this.updateStats();
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Resize failed"));
    }
  }

  /**
   * Defragment memory pool
   */
  defragment(): Result<number, Error> {
    try {
      let compacted = 0;
      const oldChunks = Array.from(this.chunks.values());

      // Remove free chunks and recreate optimal layout
      for (const chunk of oldChunks) {
        if (!chunk.allocated && this.freeChunks.has(chunk.id)) {
          this.removeChunk(chunk.id);
          compacted++;
        }
      }

      // Add back needed free chunks
      const targetFreeChunks = Math.ceil(this.stats.totalSize * 0.2 / this.config.chunkSize);
      const currentFreeChunks = this.freeChunks.size;
      
      for (let i = currentFreeChunks; i < targetFreeChunks; i++) {
        if (this.canGrow()) {
          this.createChunk();
        }
      }

      this.updateStats();
      return Result.ok(compacted);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Defragmentation failed"));
    }
  }

  /**
   * Get memory usage report
   */
  getMemoryReport(): any {
    const stats = this.getStats();
    
    return {
      pool: {
        totalSize: this.formatBytes(stats.totalSize),
        allocatedSize: this.formatBytes(stats.allocatedSize),
        freeSize: this.formatBytes(stats.freeSize),
        utilization: ((stats.allocatedSize / stats.totalSize) * 100).toFixed(2) + '%',
        fragmentation: (stats.fragmentation * 100).toFixed(2) + '%',
      },
      chunks: {
        total: stats.chunkCount,
        allocated: stats.allocatedChunks,
        free: stats.freeChunks,
        chunkSize: this.formatBytes(this.config.chunkSize),
      },
      operations: {
        allocations: stats.allocations,
        deallocations: stats.deallocations,
        leaks: stats.allocations - stats.deallocations,
      },
      config: {
        maxSize: this.formatBytes(this.config.maxSize),
        chunkSize: this.formatBytes(this.config.chunkSize),
        growthFactor: this.config.growthFactor,
      },
      system: this.getSystemMemoryInfo(),
    };
  }

  /**
   * Create new memory chunk
   */
  private createChunk(): string {
    const chunkId = `chunk-${this.nextChunkId++}`;
    const chunk: MemoryChunk = {
      id: chunkId,
      size: this.config.chunkSize,
      allocated: false,
      data: new ArrayBuffer(this.config.chunkSize),
      timestamp: Date.now(),
    };

    this.chunks.set(chunkId, chunk);
    this.freeChunks.add(chunkId);

    return chunkId;
  }

  /**
   * Remove memory chunk
   */
  private removeChunk(chunkId: string): void {
    this.chunks.delete(chunkId);
    this.freeChunks.delete(chunkId);
  }

  /**
   * Find free chunk that can accommodate size
   */
  private findFreeChunk(size: number): string | null {
    for (const chunkId of this.freeChunks) {
      const chunk = this.chunks.get(chunkId);
      if (chunk && chunk.size >= size) {
        return chunkId;
      }
    }
    return null;
  }

  /**
   * Find chunk by buffer reference
   */
  private findChunkByBuffer(buffer: ArrayBuffer): string | null {
    // Simplified approach - in production, you'd need better tracking
    for (const [chunkId, chunk] of this.chunks.entries()) {
      if (chunk.allocated && chunk.data.byteLength === buffer.byteLength) {
        return chunkId;
      }
    }
    return null;
  }

  /**
   * Check if pool can grow
   */
  private canGrow(): boolean {
    const newSize = this.stats.totalSize + this.config.chunkSize;
    return newSize <= this.config.maxSize;
  }

  /**
   * Grow memory pool
   */
  private growPool(): void {
    const growthChunks = Math.max(1, Math.ceil(this.stats.chunkCount * (this.config.growthFactor - 1)));
    
    for (let i = 0; i < growthChunks && this.canGrow(); i++) {
      this.createChunk();
    }
  }

  /**
   * Check if pool should shrink
   */
  private shouldShrink(): boolean {
    const freeRatio = this.freeChunks.size / this.chunks.size;
    return freeRatio > (1 - this.config.shrinkThreshold) && this.chunks.size > 2;
  }

  /**
   * Shrink memory pool
   */
  private shrinkPool(): void {
    const targetSize = Math.ceil(this.stats.allocatedChunks * 1.5); // Keep 50% headroom
    
    while (this.chunks.size > targetSize && this.freeChunks.size > 1) {
      const chunkId = Array.from(this.freeChunks)[0];
      this.removeChunk(chunkId);
    }
  }

  /**
   * Update pool statistics
   */
  private updateStats(): void {
    this.stats.chunkCount = this.chunks.size;
    this.stats.freeChunks = this.freeChunks.size;
    this.stats.allocatedChunks = this.stats.chunkCount - this.stats.freeChunks;
    
    this.stats.totalSize = this.stats.chunkCount * this.config.chunkSize;
    this.stats.allocatedSize = this.stats.allocatedChunks * this.config.chunkSize;
    this.stats.freeSize = this.stats.freeChunks * this.config.chunkSize;

    // Calculate fragmentation
    this.stats.fragmentation = this.stats.freeChunks > 0 
      ? 1 - (this.stats.freeSize / this.stats.totalSize) 
      : 0;
  }

  /**
   * Format bytes for human reading
   */
  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * Get system memory info
   */
  private getSystemMemoryInfo(): any {
    try {
      if (typeof Deno !== "undefined" && Deno.memoryUsage) {
        const memory = Deno.memoryUsage();
        return {
          rss: this.formatBytes(memory.rss),
          heapTotal: this.formatBytes(memory.heapTotal),
          heapUsed: this.formatBytes(memory.heapUsed),
          external: this.formatBytes(memory.external),
        };
      }
      return { available: false };
    } catch {
      return { error: "Unable to get system memory info" };
    }
  }
}