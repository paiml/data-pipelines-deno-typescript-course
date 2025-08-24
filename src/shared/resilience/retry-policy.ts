import { Result } from "../types/result.ts";

/**
 * Retry strategy types
 */
export type RetryStrategy = "fixed" | "exponential" | "linear" | "custom";

/**
 * Retry policy configuration
 */
export interface RetryPolicyConfig {
  maxAttempts?: number; // Maximum retry attempts
  initialDelay?: number; // Initial delay in milliseconds
  maxDelay?: number; // Maximum delay cap
  backoffMultiplier?: number; // Multiplier for exponential backoff
  jitterRange?: number; // Jitter range (0-1) to add randomness
  strategy?: RetryStrategy; // Retry strategy
  retryableErrors?: Array<string | RegExp>; // Which errors should be retried
  nonRetryableErrors?: Array<string | RegExp>; // Which errors should never be retried
}

/**
 * Retry attempt information
 */
export interface RetryAttempt {
  attemptNumber: number;
  delay: number;
  error: Error;
  timestamp: number;
}

/**
 * Retry policy metrics
 */
export interface RetryMetrics {
  totalAttempts: number;
  successfulRetries: number;
  failedRetries: number;
  averageAttempts: number;
  totalDelayTime: number;
  lastRetryTime?: number;
}

/**
 * Custom delay function type
 */
export type DelayFunction = (attempt: number, error: Error) => number;

/**
 * Retry policy implementation for fault tolerance
 */
export class RetryPolicy {
  private config: Required<Omit<RetryPolicyConfig, 'retryableErrors' | 'nonRetryableErrors'>> & 
                 Pick<RetryPolicyConfig, 'retryableErrors' | 'nonRetryableErrors'>;
  private metrics: RetryMetrics = {
    totalAttempts: 0,
    successfulRetries: 0,
    failedRetries: 0,
    averageAttempts: 0,
    totalDelayTime: 0,
  };
  private customDelayFn?: DelayFunction;

  constructor(private name: string, config: RetryPolicyConfig = {}) {
    this.config = {
      maxAttempts: config.maxAttempts ?? 3,
      initialDelay: config.initialDelay ?? 1000, // 1 second
      maxDelay: config.maxDelay ?? 30_000, // 30 seconds
      backoffMultiplier: config.backoffMultiplier ?? 2,
      jitterRange: config.jitterRange ?? 0.1, // 10% jitter
      strategy: config.strategy ?? "exponential",
      retryableErrors: config.retryableErrors,
      nonRetryableErrors: config.nonRetryableErrors,
    };
  }

  /**
   * Execute function with retry policy
   */
  async execute<T>(
    fn: () => Promise<T>,
    onRetry?: (attempt: RetryAttempt) => void
  ): Promise<Result<T, Error>> {
    const attempts: RetryAttempt[] = [];
    let lastError: Error = new Error("No attempts made");

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        const result = await fn();
        this.recordSuccess(attempt, attempts);
        return Result.ok(result);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Check if error should be retried
        if (!this.shouldRetry(lastError, attempt)) {
          this.recordFailure(attempt, attempts);
          return Result.err(lastError);
        }

        // Don't delay after the last attempt
        if (attempt < this.config.maxAttempts) {
          const delay = this.calculateDelay(attempt, lastError);
          const retryAttempt: RetryAttempt = {
            attemptNumber: attempt,
            delay,
            error: lastError,
            timestamp: Date.now(),
          };
          
          attempts.push(retryAttempt);
          
          if (onRetry) {
            onRetry(retryAttempt);
          }

          await this.delay(delay);
        }
      }
    }

    this.recordFailure(this.config.maxAttempts, attempts);
    return Result.err(
      new Error(
        `Retry policy '${this.name}' failed after ${this.config.maxAttempts} attempts. Last error: ${lastError.message}`
      )
    );
  }

  /**
   * Execute function with retry policy and circuit breaker integration
   */
  async executeWithCircuitBreaker<T>(
    fn: () => Promise<T>,
    circuitBreakerExecute: (fn: () => Promise<T>) => Promise<Result<T, Error>>,
    onRetry?: (attempt: RetryAttempt) => void
  ): Promise<Result<T, Error>> {
    return this.execute(async () => {
      const result = await circuitBreakerExecute(fn);
      if (Result.isErr(result)) {
        throw result.error;
      }
      return result.value;
    }, onRetry);
  }

  /**
   * Set custom delay function
   */
  setCustomDelayFunction(delayFn: DelayFunction): void {
    this.customDelayFn = delayFn;
    this.config.strategy = "custom";
  }

  /**
   * Get retry policy metrics
   */
  getMetrics(): RetryMetrics {
    return { ...this.metrics };
  }

  /**
   * Get retry policy name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Get retry policy configuration
   */
  getConfig(): RetryPolicyConfig {
    return {
      maxAttempts: this.config.maxAttempts,
      initialDelay: this.config.initialDelay,
      maxDelay: this.config.maxDelay,
      backoffMultiplier: this.config.backoffMultiplier,
      jitterRange: this.config.jitterRange,
      strategy: this.config.strategy,
      retryableErrors: this.config.retryableErrors,
      nonRetryableErrors: this.config.nonRetryableErrors,
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalAttempts: 0,
      successfulRetries: 0,
      failedRetries: 0,
      averageAttempts: 0,
      totalDelayTime: 0,
    };
  }

  /**
   * Check if error should be retried
   */
  private shouldRetry(error: Error, attempt: number): boolean {
    // Reached max attempts
    if (attempt >= this.config.maxAttempts) {
      return false;
    }

    // Check non-retryable errors first (higher priority)
    if (this.config.nonRetryableErrors) {
      for (const pattern of this.config.nonRetryableErrors) {
        if (this.matchesErrorPattern(error, pattern)) {
          return false;
        }
      }
    }

    // If retryable errors are specified, only retry those
    if (this.config.retryableErrors) {
      for (const pattern of this.config.retryableErrors) {
        if (this.matchesErrorPattern(error, pattern)) {
          return true;
        }
      }
      return false;
    }

    // Default: retry all errors except non-retryable ones
    return true;
  }

  /**
   * Check if error matches pattern
   */
  private matchesErrorPattern(error: Error, pattern: string | RegExp): boolean {
    if (typeof pattern === "string") {
      return error.message.includes(pattern) || error.name.includes(pattern);
    } else {
      return pattern.test(error.message) || pattern.test(error.name);
    }
  }

  /**
   * Calculate delay for next retry attempt
   */
  private calculateDelay(attempt: number, error: Error): number {
    let delay: number;

    switch (this.config.strategy) {
      case "fixed":
        delay = this.config.initialDelay;
        break;
      case "linear":
        delay = this.config.initialDelay * attempt;
        break;
      case "exponential":
        delay = this.config.initialDelay * Math.pow(this.config.backoffMultiplier, attempt - 1);
        break;
      case "custom":
        if (this.customDelayFn) {
          delay = this.customDelayFn(attempt, error);
        } else {
          delay = this.config.initialDelay;
        }
        break;
      default:
        delay = this.config.initialDelay;
    }

    // Apply maximum delay cap
    delay = Math.min(delay, this.config.maxDelay);

    // Add jitter to prevent thundering herd
    if (this.config.jitterRange > 0) {
      const jitterAmount = delay * this.config.jitterRange;
      const jitter = (Math.random() * 2 - 1) * jitterAmount; // -jitterAmount to +jitterAmount
      delay += jitter;
    }

    // Ensure minimum delay of 0
    return Math.max(0, Math.round(delay));
  }

  /**
   * Delay execution
   */
  private async delay(ms: number): Promise<void> {
    if (ms <= 0) return;
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Record successful execution
   */
  private recordSuccess(finalAttempt: number, attempts: RetryAttempt[]): void {
    this.metrics.totalAttempts++;
    
    if (finalAttempt > 1) {
      this.metrics.successfulRetries++;
    }

    this.updateAverageAttempts(finalAttempt);
    
    const totalDelay = attempts.reduce((sum, attempt) => sum + attempt.delay, 0);
    this.metrics.totalDelayTime += totalDelay;
    this.metrics.lastRetryTime = Date.now();
  }

  /**
   * Record failed execution
   */
  private recordFailure(finalAttempt: number, attempts: RetryAttempt[]): void {
    this.metrics.totalAttempts++;
    this.metrics.failedRetries++;
    
    this.updateAverageAttempts(finalAttempt);
    
    const totalDelay = attempts.reduce((sum, attempt) => sum + attempt.delay, 0);
    this.metrics.totalDelayTime += totalDelay;
    this.metrics.lastRetryTime = Date.now();
  }

  /**
   * Update average attempts metric
   */
  private updateAverageAttempts(attempts: number): void {
    const totalExecutions = this.metrics.totalAttempts;
    this.metrics.averageAttempts = 
      (this.metrics.averageAttempts * (totalExecutions - 1) + attempts) / totalExecutions;
  }
}

/**
 * Predefined retry policies for common scenarios
 */
export class RetryPolicies {
  /**
   * Quick retry policy for fast operations
   */
  static quick(name: string = "quick"): RetryPolicy {
    return new RetryPolicy(name, {
      maxAttempts: 3,
      initialDelay: 100,
      maxDelay: 1000,
      strategy: "exponential",
      backoffMultiplier: 2,
      jitterRange: 0.1,
    });
  }

  /**
   * Standard retry policy for typical operations
   */
  static standard(name: string = "standard"): RetryPolicy {
    return new RetryPolicy(name, {
      maxAttempts: 5,
      initialDelay: 1000,
      maxDelay: 30_000,
      strategy: "exponential",
      backoffMultiplier: 2,
      jitterRange: 0.1,
    });
  }

  /**
   * Aggressive retry policy for critical operations
   */
  static aggressive(name: string = "aggressive"): RetryPolicy {
    return new RetryPolicy(name, {
      maxAttempts: 10,
      initialDelay: 500,
      maxDelay: 60_000,
      strategy: "exponential",
      backoffMultiplier: 1.5,
      jitterRange: 0.2,
    });
  }

  /**
   * Network-specific retry policy
   */
  static network(name: string = "network"): RetryPolicy {
    return new RetryPolicy(name, {
      maxAttempts: 5,
      initialDelay: 1000,
      maxDelay: 15_000,
      strategy: "exponential",
      backoffMultiplier: 2,
      jitterRange: 0.15,
      retryableErrors: [
        "ECONNREFUSED",
        "ENOTFOUND", 
        "ETIMEDOUT",
        "ECONNRESET",
        /timeout/i,
        /network/i,
      ],
      nonRetryableErrors: [
        /401/,
        /403/,
        /404/,
        "Unauthorized",
        "Forbidden",
        "Not Found",
      ],
    });
  }

  /**
   * Database-specific retry policy
   */
  static database(name: string = "database"): RetryPolicy {
    return new RetryPolicy(name, {
      maxAttempts: 7,
      initialDelay: 2000,
      maxDelay: 30_000,
      strategy: "exponential",
      backoffMultiplier: 1.8,
      jitterRange: 0.2,
      retryableErrors: [
        /connection/i,
        /timeout/i,
        /deadlock/i,
        /lock wait timeout/i,
        /too many connections/i,
      ],
      nonRetryableErrors: [
        /syntax error/i,
        /permission denied/i,
        /access denied/i,
        /invalid/i,
      ],
    });
  }
}

/**
 * Retry policy registry for managing multiple policies
 */
export class RetryPolicyRegistry {
  private policies = new Map<string, RetryPolicy>();

  /**
   * Register retry policy
   */
  register(policy: RetryPolicy): void {
    this.policies.set(policy.getName(), policy);
  }

  /**
   * Get retry policy by name
   */
  get(name: string): RetryPolicy | undefined {
    return this.policies.get(name);
  }

  /**
   * Get or create retry policy
   */
  getOrCreate(name: string, config?: RetryPolicyConfig): RetryPolicy {
    let policy = this.policies.get(name);
    
    if (!policy) {
      policy = new RetryPolicy(name, config);
      this.policies.set(name, policy);
    }
    
    return policy;
  }

  /**
   * Remove retry policy
   */
  remove(name: string): boolean {
    return this.policies.delete(name);
  }

  /**
   * Get all policy names
   */
  getNames(): string[] {
    return Array.from(this.policies.keys());
  }

  /**
   * Get all policy metrics
   */
  getAllMetrics(): Record<string, RetryMetrics> {
    const metrics: Record<string, RetryMetrics> = {};
    
    for (const [name, policy] of this.policies.entries()) {
      metrics[name] = policy.getMetrics();
    }
    
    return metrics;
  }

  /**
   * Reset all policy metrics
   */
  resetAllMetrics(): void {
    for (const policy of this.policies.values()) {
      policy.resetMetrics();
    }
  }

  /**
   * Clear all policies
   */
  clear(): void {
    this.policies.clear();
  }
}