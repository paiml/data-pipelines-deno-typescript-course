import { Result } from "../types/result.ts";

/**
 * Cache configuration options
 */
export interface CacheConfig {
  ttl?: number; // Time to live in milliseconds
  maxSize?: number; // Maximum number of entries
  prefix?: string; // Key prefix for namespacing
}

/**
 * Cache entry metadata
 */
export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
  hits: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
  maxSize: number;
  evictions: number;
}

/**
 * Generic cache interface for different implementations
 */
export interface Cache<T = any> {
  /**
   * Get value from cache
   */
  get(key: string): Promise<Result<T | null, Error>>;

  /**
   * Set value in cache with optional TTL
   */
  set(key: string, value: T, ttl?: number): Promise<Result<void, Error>>;

  /**
   * Delete key from cache
   */
  delete(key: string): Promise<Result<boolean, Error>>;

  /**
   * Check if key exists in cache
   */
  has(key: string): Promise<Result<boolean, Error>>;

  /**
   * Clear all cache entries
   */
  clear(): Promise<Result<void, Error>>;

  /**
   * Get cache statistics
   */
  getStats(): Promise<Result<CacheStats, Error>>;

  /**
   * Get all keys matching pattern
   */
  keys(pattern?: string): Promise<Result<string[], Error>>;

  /**
   * Bulk get operation
   */
  mget(keys: string[]): Promise<Result<Map<string, T | null>, Error>>;

  /**
   * Bulk set operation
   */
  mset(entries: Map<string, T>, ttl?: number): Promise<Result<void, Error>>;

  /**
   * Close cache connection
   */
  close(): Promise<Result<void, Error>>;
}