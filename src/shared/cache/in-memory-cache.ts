import { Cache, CacheConfig, CacheEntry, CacheStats } from "./cache-interface.ts";
import { Result } from "../types/result.ts";

/**
 * In-memory cache implementation with LRU eviction
 */
export class InMemoryCache<T = any> implements Cache<T> {
  private data = new Map<string, CacheEntry<T>>();
  private accessOrder = new Map<string, number>(); // For LRU tracking
  private config: Required<CacheConfig>;
  private stats: CacheStats;
  private accessCounter = 0;

  constructor(config: CacheConfig = {}) {
    this.config = {
      ttl: config.ttl ?? 300_000, // 5 minutes default
      maxSize: config.maxSize ?? 1000,
      prefix: config.prefix ?? "",
    };

    this.stats = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      size: 0,
      maxSize: this.config.maxSize,
      evictions: 0,
    };
  }

  /**
   * Get value from cache
   */
  async get(key: string): Promise<Result<T | null, Error>> {
    try {
      const prefixedKey = this.getPrefixedKey(key);
      const entry = this.data.get(prefixedKey);

      if (!entry) {
        this.stats.misses++;
        this.updateHitRate();
        return Result.ok(null);
      }

      // Check if expired
      if (this.isExpired(entry)) {
        this.data.delete(prefixedKey);
        this.accessOrder.delete(prefixedKey);
        this.stats.size--;
        this.stats.misses++;
        this.updateHitRate();
        return Result.ok(null);
      }

      // Update access tracking for LRU
      entry.hits++;
      this.accessOrder.set(prefixedKey, ++this.accessCounter);
      this.stats.hits++;
      this.updateHitRate();

      return Result.ok(entry.value);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Cache get failed"));
    }
  }

  /**
   * Set value in cache with optional TTL
   */
  async set(key: string, value: T, ttl?: number): Promise<Result<void, Error>> {
    try {
      const prefixedKey = this.getPrefixedKey(key);
      const effectiveTtl = ttl ?? this.config.ttl;

      // Check if we need to evict entries
      if (this.data.size >= this.config.maxSize && !this.data.has(prefixedKey)) {
        await this.evictLRU();
      }

      const entry: CacheEntry<T> = {
        value,
        timestamp: Date.now(),
        ttl: effectiveTtl,
        hits: 0,
      };

      this.data.set(prefixedKey, entry);
      this.accessOrder.set(prefixedKey, ++this.accessCounter);

      // Update size after setting
      this.stats.size = this.data.size;

      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Cache set failed"));
    }
  }

  /**
   * Delete key from cache
   */
  async delete(key: string): Promise<Result<boolean, Error>> {
    try {
      const prefixedKey = this.getPrefixedKey(key);
      const existed = this.data.delete(prefixedKey);
      
      if (existed) {
        this.accessOrder.delete(prefixedKey);
        this.stats.size--;
      }

      return Result.ok(existed);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Cache delete failed"));
    }
  }

  /**
   * Check if key exists in cache
   */
  async has(key: string): Promise<Result<boolean, Error>> {
    try {
      const prefixedKey = this.getPrefixedKey(key);
      const entry = this.data.get(prefixedKey);

      if (!entry) {
        return Result.ok(false);
      }

      // Check if expired
      if (this.isExpired(entry)) {
        this.data.delete(prefixedKey);
        this.accessOrder.delete(prefixedKey);
        this.stats.size--;
        return Result.ok(false);
      }

      return Result.ok(true);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Cache has failed"));
    }
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<Result<void, Error>> {
    try {
      this.data.clear();
      this.accessOrder.clear();
      this.stats.size = 0;
      this.stats.evictions = 0;
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Cache clear failed"));
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<Result<CacheStats, Error>> {
    try {
      return Result.ok({ ...this.stats });
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Get stats failed"));
    }
  }

  /**
   * Get all keys matching pattern
   */
  async keys(pattern?: string): Promise<Result<string[], Error>> {
    try {
      const allKeys = Array.from(this.data.keys());
      
      if (!pattern) {
        return Result.ok(allKeys.map(key => this.stripPrefix(key)));
      }

      // Simple pattern matching (supports * wildcard)
      const regex = new RegExp(
        pattern.replace(/\*/g, ".*").replace(/\?/g, "."),
        "i"
      );

      const matchingKeys = allKeys
        .filter(key => regex.test(this.stripPrefix(key)))
        .map(key => this.stripPrefix(key));

      return Result.ok(matchingKeys);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Cache keys failed"));
    }
  }

  /**
   * Bulk get operation
   */
  async mget(keys: string[]): Promise<Result<Map<string, T | null>, Error>> {
    try {
      const results = new Map<string, T | null>();

      for (const key of keys) {
        const result = await this.get(key);
        if (Result.isOk(result)) {
          results.set(key, result.value);
        } else {
          return Result.err(result.error);
        }
      }

      return Result.ok(results);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Cache mget failed"));
    }
  }

  /**
   * Bulk set operation
   */
  async mset(entries: Map<string, T>, ttl?: number): Promise<Result<void, Error>> {
    try {
      for (const [key, value] of entries) {
        const result = await this.set(key, value, ttl);
        if (Result.isErr(result)) {
          return Result.err(result.error);
        }
      }
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Cache mset failed"));
    }
  }

  /**
   * Close cache connection (no-op for in-memory)
   */
  async close(): Promise<Result<void, Error>> {
    return Result.ok(undefined);
  }

  /**
   * Clean up expired entries
   */
  async cleanup(): Promise<Result<number, Error>> {
    try {
      let cleaned = 0;
      const now = Date.now();

      for (const [key, entry] of this.data.entries()) {
        if (now - entry.timestamp > entry.ttl) {
          this.data.delete(key);
          this.accessOrder.delete(key);
          this.stats.size--;
          cleaned++;
        }
      }

      return Result.ok(cleaned);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Cache cleanup failed"));
    }
  }

  /**
   * Start periodic cleanup
   */
  startPeriodicCleanup(intervalMs: number = 60_000): void {
    setInterval(async () => {
      await this.cleanup();
    }, intervalMs);
  }

  private getPrefixedKey(key: string): string {
    return this.config.prefix ? `${this.config.prefix}:${key}` : key;
  }

  private stripPrefix(key: string): string {
    if (this.config.prefix && key.startsWith(`${this.config.prefix}:`)) {
      return key.slice(this.config.prefix.length + 1);
    }
    return key;
  }

  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  private async evictLRU(): Promise<void> {
    // Find least recently used entry
    let lruKey: string | null = null;
    let lruAccess = Infinity;

    for (const [key, access] of this.accessOrder.entries()) {
      if (access < lruAccess) {
        lruAccess = access;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.data.delete(lruKey);
      this.accessOrder.delete(lruKey);
      this.stats.size--;
      this.stats.evictions++;
    }
  }
}