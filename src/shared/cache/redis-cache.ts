import { Cache, CacheConfig, CacheStats } from "./cache-interface.ts";
import { Result } from "../types/result.ts";

/**
 * Redis connection configuration
 */
export interface RedisConfig extends CacheConfig {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  connectTimeout?: number;
  commandTimeout?: number;
}

/**
 * Redis cache implementation
 * Note: This is a mock implementation for the course
 * In production, you would use a real Redis client
 */
export class RedisCache<T = any> implements Cache<T> {
  private config: Required<RedisConfig>;
  private connected = false;
  private stats: CacheStats;
  private mockStore = new Map<string, { value: T; expiry: number }>();

  constructor(config: RedisConfig = {}) {
    this.config = {
      ttl: config.ttl ?? 300_000, // 5 minutes default
      maxSize: config.maxSize ?? 10_000,
      prefix: config.prefix ?? "pipeline:",
      host: config.host ?? "localhost",
      port: config.port ?? 6379,
      password: config.password ?? "",
      db: config.db ?? 0,
      connectTimeout: config.connectTimeout ?? 5_000,
      commandTimeout: config.commandTimeout ?? 3_000,
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
   * Connect to Redis
   */
  async connect(): Promise<Result<void, Error>> {
    try {
      // Mock connection - in production use real Redis client
      await new Promise(resolve => setTimeout(resolve, 100));
      this.connected = true;
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Redis connect failed"));
    }
  }

  /**
   * Get value from Redis
   */
  async get(key: string): Promise<Result<T | null, Error>> {
    try {
      if (!this.connected) {
        return Result.err(new Error("Not connected to Redis"));
      }

      const prefixedKey = this.getPrefixedKey(key);
      
      // Mock Redis operation
      const entry = this.mockStore.get(prefixedKey);
      
      if (!entry) {
        this.stats.misses++;
        this.updateHitRate();
        return Result.ok(null);
      }

      // Check expiry
      if (Date.now() > entry.expiry) {
        this.mockStore.delete(prefixedKey);
        this.stats.misses++;
        this.updateHitRate();
        return Result.ok(null);
      }

      this.stats.hits++;
      this.updateHitRate();
      
      return Result.ok(entry.value);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Redis get failed"));
    }
  }

  /**
   * Set value in Redis with optional TTL
   */
  async set(key: string, value: T, ttl?: number): Promise<Result<void, Error>> {
    try {
      if (!this.connected) {
        return Result.err(new Error("Not connected to Redis"));
      }

      const prefixedKey = this.getPrefixedKey(key);
      const effectiveTtl = ttl ?? this.config.ttl;
      const expiry = Date.now() + effectiveTtl;

      // Mock Redis operation
      this.mockStore.set(prefixedKey, { value, expiry });
      
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Redis set failed"));
    }
  }

  /**
   * Delete key from Redis
   */
  async delete(key: string): Promise<Result<boolean, Error>> {
    try {
      if (!this.connected) {
        return Result.err(new Error("Not connected to Redis"));
      }

      const prefixedKey = this.getPrefixedKey(key);
      const existed = this.mockStore.delete(prefixedKey);
      
      return Result.ok(existed);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Redis delete failed"));
    }
  }

  /**
   * Check if key exists in Redis
   */
  async has(key: string): Promise<Result<boolean, Error>> {
    try {
      if (!this.connected) {
        return Result.err(new Error("Not connected to Redis"));
      }

      const prefixedKey = this.getPrefixedKey(key);
      const entry = this.mockStore.get(prefixedKey);
      
      if (!entry) {
        return Result.ok(false);
      }

      // Check expiry
      if (Date.now() > entry.expiry) {
        this.mockStore.delete(prefixedKey);
        return Result.ok(false);
      }

      return Result.ok(true);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Redis has failed"));
    }
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<Result<void, Error>> {
    try {
      if (!this.connected) {
        return Result.err(new Error("Not connected to Redis"));
      }

      // Mock Redis FLUSHDB
      this.mockStore.clear();
      this.stats.size = 0;
      this.stats.evictions = 0;
      
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Redis clear failed"));
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<Result<CacheStats, Error>> {
    try {
      // Update size from mock store
      this.stats.size = this.mockStore.size;
      return Result.ok({ ...this.stats });
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Redis stats failed"));
    }
  }

  /**
   * Get all keys matching pattern
   */
  async keys(pattern?: string): Promise<Result<string[], Error>> {
    try {
      if (!this.connected) {
        return Result.err(new Error("Not connected to Redis"));
      }

      // Mock Redis KEYS command
      const allKeys = Array.from(this.mockStore.keys());
      
      if (!pattern) {
        return Result.ok(allKeys.map(key => this.stripPrefix(key)));
      }

      // Simple pattern matching
      const regex = new RegExp(
        pattern.replace(/\*/g, ".*").replace(/\?/g, "."),
        "i"
      );

      const matchingKeys = allKeys
        .filter(key => regex.test(this.stripPrefix(key)))
        .map(key => this.stripPrefix(key));

      return Result.ok(matchingKeys);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Redis keys failed"));
    }
  }

  /**
   * Bulk get operation
   */
  async mget(keys: string[]): Promise<Result<Map<string, T | null>, Error>> {
    try {
      if (!this.connected) {
        return Result.err(new Error("Not connected to Redis"));
      }

      const results = new Map<string, T | null>();

      // Mock Redis MGET
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
      return Result.err(error instanceof Error ? error : new Error("Redis mget failed"));
    }
  }

  /**
   * Bulk set operation
   */
  async mset(entries: Map<string, T>, ttl?: number): Promise<Result<void, Error>> {
    try {
      if (!this.connected) {
        return Result.err(new Error("Not connected to Redis"));
      }

      // Mock Redis pipeline operation
      for (const [key, value] of entries) {
        const result = await this.set(key, value, ttl);
        if (Result.isErr(result)) {
          return Result.err(result.error);
        }
      }

      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Redis mset failed"));
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<Result<void, Error>> {
    try {
      this.connected = false;
      this.mockStore.clear();
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Redis close failed"));
    }
  }

  /**
   * Ping Redis server
   */
  async ping(): Promise<Result<string, Error>> {
    try {
      if (!this.connected) {
        return Result.err(new Error("Not connected to Redis"));
      }

      // Mock ping
      return Result.ok("PONG");
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Redis ping failed"));
    }
  }

  /**
   * Get Redis info
   */
  async info(): Promise<Result<Record<string, string>, Error>> {
    try {
      if (!this.connected) {
        return Result.err(new Error("Not connected to Redis"));
      }

      // Mock Redis INFO command
      return Result.ok({
        redis_version: "7.0.0",
        used_memory: "1024000",
        connected_clients: "1",
        total_connections_received: "100",
        keyspace_hits: this.stats.hits.toString(),
        keyspace_misses: this.stats.misses.toString(),
      });
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Redis info failed"));
    }
  }

  private getPrefixedKey(key: string): string {
    return this.config.prefix ? `${this.config.prefix}${key}` : key;
  }

  private stripPrefix(key: string): string {
    if (this.config.prefix && key.startsWith(this.config.prefix)) {
      return key.slice(this.config.prefix.length);
    }
    return key;
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }
}