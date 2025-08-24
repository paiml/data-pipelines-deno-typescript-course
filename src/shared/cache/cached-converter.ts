import { Converter, ConverterConfig, ConverterMetadata, ConversionError, Result } from "../types/index.ts";
import { Cache } from "./cache-interface.ts";
import { CacheManager } from "./cache-manager.ts";

/**
 * Configuration for cached converter
 */
export interface CachedConverterConfig extends ConverterConfig {
  cache?: {
    enabled?: boolean;
    ttl?: number; // Cache TTL in milliseconds
    keyPrefix?: string;
    maxSize?: number;
  };
}

/**
 * Wrapper that adds caching capabilities to any converter
 */
export class CachedConverter<TInput, TOutput> implements Converter<TInput, TOutput> {
  private cache: Cache;
  private baseConverter: Converter<TInput, TOutput>;
  private cacheConfig: Required<NonNullable<CachedConverterConfig["cache"]>>;

  constructor(
    baseConverter: Converter<TInput, TOutput>,
    cache?: Cache,
    cacheConfig?: CachedConverterConfig["cache"]
  ) {
    this.baseConverter = baseConverter;
    this.cache = cache ?? new CacheManager();
    
    this.cacheConfig = {
      enabled: cacheConfig?.enabled ?? true,
      ttl: cacheConfig?.ttl ?? 300_000, // 5 minutes default
      keyPrefix: cacheConfig?.keyPrefix ?? "conv:",
      maxSize: cacheConfig?.maxSize ?? 1000,
    };
  }

  /**
   * Convert with caching
   */
  async convert(
    input: TInput,
    config?: CachedConverterConfig,
  ): Promise<Result<TOutput, ConversionError>> {
    // Check if caching is enabled
    if (!this.cacheConfig.enabled || config?.cache?.enabled === false) {
      return await this.baseConverter.convert(input, config);
    }

    try {
      // Generate cache key
      const cacheKey = this.generateCacheKey(input);
      
      // Try to get from cache
      const cacheResult = await this.cache.get(cacheKey);
      
      if (Result.isOk(cacheResult) && cacheResult.value !== null) {
        // Cache hit - return cached result
        return Result.ok(cacheResult.value as TOutput);
      }

      // Cache miss - perform conversion
      const conversionResult = await this.baseConverter.convert(input, config);
      
      if (Result.isOk(conversionResult)) {
        // Cache successful conversion
        const ttl = config?.cache?.ttl ?? this.cacheConfig.ttl;
        await this.cache.set(cacheKey, conversionResult.value, ttl);
      }

      return conversionResult;
    } catch (error) {
      // If caching fails, still try the conversion
      return await this.baseConverter.convert(input, config);
    }
  }

  /**
   * Validate input (delegates to base converter)
   */
  validate(input: unknown): input is TInput {
    return this.baseConverter.validate(input);
  }

  /**
   * Get metadata with caching info
   */
  getMetadata(): ConverterMetadata {
    const baseMetadata = this.baseConverter.getMetadata();
    
    return {
      ...baseMetadata,
      name: `Cached ${baseMetadata.name}`,
      description: `${baseMetadata.description} (with caching)`,
      features: [
        ...(baseMetadata.features || []),
        "caching",
        "performance-optimized"
      ]
    };
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    return await this.cache.getStats();
  }

  /**
   * Clear cache
   */
  async clearCache(): Promise<Result<void, Error>> {
    return await this.cache.clear();
  }

  /**
   * Warm up cache with common inputs
   */
  async warmCache(inputs: TInput[], config?: CachedConverterConfig): Promise<Result<number, Error>> {
    try {
      let warmed = 0;

      for (const input of inputs) {
        const result = await this.convert(input, config);
        if (Result.isOk(result)) {
          warmed++;
        }
      }

      return Result.ok(warmed);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Cache warm failed"));
    }
  }

  /**
   * Invalidate cache entries matching pattern
   */
  async invalidateCache(pattern?: string): Promise<Result<number, Error>> {
    try {
      const keysResult = await this.cache.keys(pattern);
      
      if (Result.isErr(keysResult)) {
        return Result.err(keysResult.error);
      }

      let invalidated = 0;
      for (const key of keysResult.value) {
        const deleteResult = await this.cache.delete(key);
        if (Result.isOk(deleteResult) && deleteResult.value) {
          invalidated++;
        }
      }

      return Result.ok(invalidated);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Cache invalidation failed"));
    }
  }

  /**
   * Get the underlying base converter
   */
  getBaseConverter(): Converter<TInput, TOutput> {
    return this.baseConverter;
  }

  /**
   * Get the cache instance
   */
  getCache(): Cache {
    return this.cache;
  }

  /**
   * Generate cache key for input
   */
  private generateCacheKey(input: TInput): string {
    // Create a deterministic hash of the input
    const inputStr = JSON.stringify(input, Object.keys(input as any).sort());
    const hash = this.simpleHash(inputStr);
    return `${this.cacheConfig.keyPrefix}${this.baseConverter.getMetadata().name}:${hash}`;
  }

  /**
   * Simple hash function for cache keys
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }
}