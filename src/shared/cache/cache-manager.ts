import { Cache, CacheConfig, CacheStats } from "./cache-interface.ts";
import { InMemoryCache } from "./in-memory-cache.ts";
import { RedisCache } from "./redis-cache.ts";
import { Result } from "../types/result.ts";

/**
 * Cache tier configuration
 */
export interface CacheTierConfig {
  name: string;
  type: "memory" | "redis";
  config: CacheConfig;
  priority: number; // Higher number = higher priority
}

/**
 * Multi-tier cache manager with L1 (memory) and L2 (Redis) support
 */
export class CacheManager<T = any> implements Cache<T> {
  private tiers = new Map<string, Cache<T>>();
  private orderedTiers: Array<{ name: string; cache: Cache<T>; priority: number }> = [];

  constructor(tiers: CacheTierConfig[] = []) {
    if (tiers.length === 0) {
      // Default configuration: L1 memory + L2 Redis
      this.addTier({
        name: "L1",
        type: "memory",
        config: { ttl: 60_000, maxSize: 1000, prefix: "l1" }, // 1 minute
        priority: 2,
      });
      
      this.addTier({
        name: "L2",
        type: "redis",
        config: { ttl: 300_000, maxSize: 10_000, prefix: "l2" }, // 5 minutes
        priority: 1,
      });
    } else {
      tiers.forEach(tier => this.addTier(tier));
    }
  }

  /**
   * Add a cache tier
   */
  addTier(config: CacheTierConfig): void {
    let cache: Cache<T>;

    switch (config.type) {
      case "memory":
        cache = new InMemoryCache<T>(config.config);
        break;
      case "redis":
        cache = new RedisCache<T>(config.config);
        break;
      default:
        throw new Error(`Unsupported cache type: ${config.type}`);
    }

    this.tiers.set(config.name, cache);
    this.orderedTiers.push({
      name: config.name,
      cache,
      priority: config.priority,
    });

    // Sort by priority (highest first)
    this.orderedTiers.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Initialize all cache tiers
   */
  async initialize(): Promise<Result<void, Error>> {
    try {
      for (const { cache } of this.orderedTiers) {
        if (cache instanceof RedisCache) {
          const result = await cache.connect();
          if (Result.isErr(result)) {
            return result;
          }
        }
      }
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Cache manager init failed"));
    }
  }

  /**
   * Get value from cache (checks all tiers in order)
   */
  async get(key: string): Promise<Result<T | null, Error>> {
    try {
      for (let i = 0; i < this.orderedTiers.length; i++) {
        const { cache, name } = this.orderedTiers[i];
        const result = await cache.get(key);

        if (Result.isErr(result)) {
          continue; // Try next tier
        }

        if (result.value !== null) {
          // Found in tier i, promote to higher tiers
          await this.promoteToHigherTiers(key, result.value, i);
          return Result.ok(result.value);
        }
      }

      return Result.ok(null); // Not found in any tier
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Cache get failed"));
    }
  }

  /**
   * Set value in all cache tiers
   */
  async set(key: string, value: T, ttl?: number): Promise<Result<void, Error>> {
    try {
      const errors: Error[] = [];

      for (const { cache } of this.orderedTiers) {
        const result = await cache.set(key, value, ttl);
        if (Result.isErr(result)) {
          errors.push(result.error);
        }
      }

      // If all tiers failed, return error
      if (errors.length === this.orderedTiers.length) {
        return Result.err(new Error(`All cache tiers failed: ${errors.map(e => e.message).join(", ")}`));
      }

      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Cache set failed"));
    }
  }

  /**
   * Delete key from all cache tiers
   */
  async delete(key: string): Promise<Result<boolean, Error>> {
    try {
      let deleted = false;

      for (const { cache } of this.orderedTiers) {
        const result = await cache.delete(key);
        if (Result.isOk(result) && result.value) {
          deleted = true;
        }
      }

      return Result.ok(deleted);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Cache delete failed"));
    }
  }

  /**
   * Check if key exists in any tier
   */
  async has(key: string): Promise<Result<boolean, Error>> {
    try {
      for (const { cache } of this.orderedTiers) {
        const result = await cache.has(key);
        if (Result.isOk(result) && result.value) {
          return Result.ok(true);
        }
      }
      return Result.ok(false);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Cache has failed"));
    }
  }

  /**
   * Clear all cache tiers
   */
  async clear(): Promise<Result<void, Error>> {
    try {
      for (const { cache } of this.orderedTiers) {
        await cache.clear();
      }
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Cache clear failed"));
    }
  }

  /**
   * Get aggregated cache statistics
   */
  async getStats(): Promise<Result<CacheStats, Error>> {
    try {
      const tierStats = new Map<string, CacheStats>();

      for (const { name, cache } of this.orderedTiers) {
        const result = await cache.getStats();
        if (Result.isOk(result)) {
          tierStats.set(name, result.value);
        }
      }

      // Aggregate stats
      let totalHits = 0;
      let totalMisses = 0;
      let totalSize = 0;
      let totalMaxSize = 0;
      let totalEvictions = 0;

      for (const stats of tierStats.values()) {
        totalHits += stats.hits;
        totalMisses += stats.misses;
        totalSize += stats.size;
        totalMaxSize += stats.maxSize;
        totalEvictions += stats.evictions;
      }

      const aggregatedStats: CacheStats = {
        hits: totalHits,
        misses: totalMisses,
        hitRate: totalHits + totalMisses > 0 ? totalHits / (totalHits + totalMisses) : 0,
        size: totalSize,
        maxSize: totalMaxSize,
        evictions: totalEvictions,
      };

      return Result.ok(aggregatedStats);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Get cache stats failed"));
    }
  }

  /**
   * Get statistics for a specific tier
   */
  async getTierStats(tierName: string): Promise<Result<CacheStats, Error>> {
    const cache = this.tiers.get(tierName);
    if (!cache) {
      return Result.err(new Error(`Cache tier '${tierName}' not found`));
    }
    return await cache.getStats();
  }

  /**
   * Get all keys from all tiers
   */
  async keys(pattern?: string): Promise<Result<string[], Error>> {
    try {
      const allKeys = new Set<string>();

      for (const { cache } of this.orderedTiers) {
        const result = await cache.keys(pattern);
        if (Result.isOk(result)) {
          result.value.forEach(key => allKeys.add(key));
        }
      }

      return Result.ok(Array.from(allKeys));
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
      const missingKeys = new Set(keys);

      // Check each tier in order
      for (let i = 0; i < this.orderedTiers.length && missingKeys.size > 0; i++) {
        const { cache } = this.orderedTiers[i];
        const tierKeys = Array.from(missingKeys);
        const result = await cache.mget(tierKeys);

        if (Result.isOk(result)) {
          for (const [key, value] of result.value.entries()) {
            if (value !== null) {
              results.set(key, value);
              missingKeys.delete(key);
              // Promote to higher tiers
              await this.promoteToHigherTiers(key, value, i);
            }
          }
        }
      }

      // Set null for missing keys
      for (const key of missingKeys) {
        results.set(key, null);
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
      for (const { cache } of this.orderedTiers) {
        const result = await cache.mset(entries, ttl);
        // Continue even if some tiers fail
      }
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Cache mset failed"));
    }
  }

  /**
   * Close all cache connections
   */
  async close(): Promise<Result<void, Error>> {
    try {
      for (const { cache } of this.orderedTiers) {
        await cache.close();
      }
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Cache close failed"));
    }
  }

  /**
   * Get list of all tiers
   */
  getTiers(): string[] {
    return this.orderedTiers.map(t => t.name);
  }

  /**
   * Remove a tier
   */
  async removeTier(name: string): Promise<Result<void, Error>> {
    try {
      const cache = this.tiers.get(name);
      if (cache) {
        await cache.close();
        this.tiers.delete(name);
        this.orderedTiers = this.orderedTiers.filter(t => t.name !== name);
      }
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Remove tier failed"));
    }
  }

  /**
   * Promote value to higher priority tiers
   */
  private async promoteToHigherTiers(key: string, value: T, fromTierIndex: number): Promise<void> {
    for (let i = 0; i < fromTierIndex; i++) {
      const { cache } = this.orderedTiers[i];
      await cache.set(key, value); // Use default TTL for promotion
    }
  }
}