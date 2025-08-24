import { MemoryPool } from "./memory-pool.ts";
import { Result } from "../types/result.ts";

/**
 * Stream optimization configuration
 */
export interface StreamOptimizerConfig {
  bufferSize?: number;
  maxBuffers?: number;
  compressionEnabled?: boolean;
  compressionThreshold?: number;
  chunkSize?: number;
  backpressureThreshold?: number;
  memoryPool?: MemoryPool;
}

/**
 * Stream chunk with metadata
 */
export interface OptimizedChunk {
  id: string;
  data: Uint8Array;
  timestamp: number;
  compressed: boolean;
  originalSize: number;
  sequence: number;
}

/**
 * Stream optimizer for memory-efficient processing
 */
export class StreamOptimizer {
  private config: Required<StreamOptimizerConfig>;
  private memoryPool: MemoryPool;
  private activeStreams = new Map<string, ReadableStream>();
  private chunkSequence = 0;
  private stats = {
    chunksProcessed: 0,
    bytesProcessed: 0,
    compressionSavings: 0,
    averageChunkSize: 0,
    memoryUsage: 0,
  };

  constructor(config: StreamOptimizerConfig = {}) {
    this.config = {
      bufferSize: config.bufferSize ?? 64 * 1024, // 64KB
      maxBuffers: config.maxBuffers ?? 100,
      compressionEnabled: config.compressionEnabled ?? true,
      compressionThreshold: config.compressionThreshold ?? 1024, // 1KB
      chunkSize: config.chunkSize ?? 8 * 1024, // 8KB
      backpressureThreshold: config.backpressureThreshold ?? 0.8, // 80%
      memoryPool: config.memoryPool ?? new MemoryPool(),
    };

    this.memoryPool = this.config.memoryPool;
  }

  /**
   * Create optimized transform stream
   */
  createOptimizedStream<T>(
    transformer: (chunk: T) => Promise<T> | T
  ): TransformStream<T, OptimizedChunk> {
    const optimizer = this;
    
    return new TransformStream({
      start(controller) {
        // Initialize stream
      },

      async transform(chunk: T, controller) {
        try {
          // Transform the chunk
          const transformedChunk = await transformer(chunk);
          
          // Create optimized chunk
          const optimizedChunk = await optimizer.optimizeChunk(transformedChunk);
          
          if (Result.isOk(optimizedChunk)) {
            controller.enqueue(optimizedChunk.value);
            optimizer.updateStats(optimizedChunk.value);
          } else {
            console.warn("Failed to optimize chunk:", optimizedChunk.error);
            // Fallback to unoptimized chunk
            const fallbackChunk = optimizer.createFallbackChunk(transformedChunk);
            controller.enqueue(fallbackChunk);
          }
        } catch (error) {
          console.error("Transform error:", error);
          controller.error(error);
        }
      },

      flush(controller) {
        // Cleanup
        optimizer.cleanup();
      }
    });
  }

  /**
   * Create chunked readable stream
   */
  createChunkedStream(data: Uint8Array): ReadableStream<OptimizedChunk> {
    const optimizer = this;
    let offset = 0;
    
    return new ReadableStream({
      start(controller) {
        // Initialize
      },

      pull(controller) {
        if (offset >= data.length) {
          controller.close();
          return;
        }

        const chunkSize = Math.min(optimizer.config.chunkSize, data.length - offset);
        const chunkData = data.slice(offset, offset + chunkSize);
        offset += chunkSize;

        const optimizedChunk = optimizer.createOptimizedChunk(chunkData);
        controller.enqueue(optimizedChunk);
        optimizer.updateStats(optimizedChunk);
      },

      cancel(reason) {
        console.log("Stream cancelled:", reason);
        optimizer.cleanup();
      }
    });
  }

  /**
   * Create memory-efficient writable stream
   */
  createOptimizedWritableStream<T>(
    writer: (chunk: OptimizedChunk) => Promise<void> | void
  ): WritableStream<T> {
    const optimizer = this;
    
    return new WritableStream({
      start(controller) {
        // Initialize
      },

      async write(chunk: T, controller) {
        try {
          const optimizedChunk = await optimizer.optimizeChunk(chunk);
          
          if (Result.isOk(optimizedChunk)) {
            await writer(optimizedChunk.value);
            optimizer.updateStats(optimizedChunk.value);
          } else {
            throw optimizedChunk.error;
          }
        } catch (error) {
          console.error("Write error:", error);
          controller.error(error);
        }
      },

      close() {
        optimizer.cleanup();
      },

      abort(reason) {
        console.log("Stream aborted:", reason);
        optimizer.cleanup();
      }
    });
  }

  /**
   * Optimize chunk for memory efficiency
   */
  async optimizeChunk<T>(chunk: T): Promise<Result<OptimizedChunk, Error>> {
    try {
      // Serialize chunk to bytes
      const serialized = this.serializeChunk(chunk);
      const originalSize = serialized.length;

      let data = serialized;
      let compressed = false;

      // Apply compression if enabled and chunk is large enough
      if (this.config.compressionEnabled && originalSize >= this.config.compressionThreshold) {
        const compressionResult = await this.compressData(serialized);
        if (Result.isOk(compressionResult) && compressionResult.value.length < originalSize) {
          data = compressionResult.value;
          compressed = true;
          this.stats.compressionSavings += (originalSize - data.length);
        }
      }

      const optimizedChunk: OptimizedChunk = {
        id: `chunk-${this.chunkSequence++}`,
        data,
        timestamp: Date.now(),
        compressed,
        originalSize,
        sequence: this.chunkSequence,
      };

      return Result.ok(optimizedChunk);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Chunk optimization failed"));
    }
  }

  /**
   * Create optimized chunk from raw data
   */
  createOptimizedChunk(data: Uint8Array): OptimizedChunk {
    return {
      id: `chunk-${this.chunkSequence++}`,
      data,
      timestamp: Date.now(),
      compressed: false,
      originalSize: data.length,
      sequence: this.chunkSequence,
    };
  }

  /**
   * Create fallback chunk when optimization fails
   */
  createFallbackChunk<T>(chunk: T): OptimizedChunk {
    const serialized = this.serializeChunk(chunk);
    return this.createOptimizedChunk(serialized);
  }

  /**
   * Decompress optimized chunk
   */
  async decompressChunk(chunk: OptimizedChunk): Promise<Result<Uint8Array, Error>> {
    try {
      if (!chunk.compressed) {
        return Result.ok(chunk.data);
      }

      return await this.decompressData(chunk.data);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Decompression failed"));
    }
  }

  /**
   * Get stream optimizer statistics
   */
  getStats() {
    const poolStats = this.memoryPool.getStats();
    
    return {
      ...this.stats,
      memoryPool: poolStats,
      activeStreams: this.activeStreams.size,
      averageChunkSize: this.stats.chunksProcessed > 0 
        ? Math.round(this.stats.bytesProcessed / this.stats.chunksProcessed)
        : 0,
      compressionRatio: this.stats.compressionSavings > 0 
        ? (this.stats.compressionSavings / this.stats.bytesProcessed) 
        : 0,
    };
  }

  /**
   * Monitor memory usage and apply backpressure
   */
  shouldApplyBackpressure(): boolean {
    const poolStats = this.memoryPool.getStats();
    const utilization = poolStats.allocatedSize / poolStats.totalSize;
    
    return utilization > this.config.backpressureThreshold;
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    // Clear active streams
    for (const [streamId, stream] of this.activeStreams.entries()) {
      try {
        if (stream.cancel) {
          stream.cancel("Cleanup");
        }
      } catch (error) {
        console.warn(`Failed to cancel stream ${streamId}:`, error);
      }
    }
    
    this.activeStreams.clear();
  }

  /**
   * Serialize chunk to bytes
   */
  private serializeChunk<T>(chunk: T): Uint8Array {
    try {
      if (chunk instanceof Uint8Array) {
        return chunk;
      }
      
      if (typeof chunk === "string") {
        return new TextEncoder().encode(chunk);
      }
      
      // Serialize as JSON for other types
      const json = JSON.stringify(chunk);
      return new TextEncoder().encode(json);
    } catch (error) {
      throw new Error(`Failed to serialize chunk: ${error}`);
    }
  }

  /**
   * Compress data using simple compression
   */
  private async compressData(data: Uint8Array): Promise<Result<Uint8Array, Error>> {
    try {
      // Mock compression for course demonstration
      // In production, use actual compression algorithms like gzip, brotli, etc.
      const compressionStream = new CompressionStream("gzip");
      const writer = compressionStream.writable.getWriter();
      const reader = compressionStream.readable.getReader();

      // Write data
      await writer.write(data);
      await writer.close();

      // Read compressed result
      const chunks: Uint8Array[] = [];
      let totalLength = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        chunks.push(value);
        totalLength += value.length;
      }

      // Combine chunks
      const compressed = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        compressed.set(chunk, offset);
        offset += chunk.length;
      }

      return Result.ok(compressed);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Compression failed"));
    }
  }

  /**
   * Decompress data
   */
  private async decompressData(data: Uint8Array): Promise<Result<Uint8Array, Error>> {
    try {
      // Mock decompression for course demonstration
      const decompressionStream = new DecompressionStream("gzip");
      const writer = decompressionStream.writable.getWriter();
      const reader = decompressionStream.readable.getReader();

      // Write compressed data
      await writer.write(data);
      await writer.close();

      // Read decompressed result
      const chunks: Uint8Array[] = [];
      let totalLength = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        chunks.push(value);
        totalLength += value.length;
      }

      // Combine chunks
      const decompressed = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        decompressed.set(chunk, offset);
        offset += chunk.length;
      }

      return Result.ok(decompressed);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Decompression failed"));
    }
  }

  /**
   * Update processing statistics
   */
  private updateStats(chunk: OptimizedChunk): void {
    this.stats.chunksProcessed++;
    this.stats.bytesProcessed += chunk.originalSize;
    
    const poolStats = this.memoryPool.getStats();
    this.stats.memoryUsage = poolStats.allocatedSize;
  }
}