import { Result } from "../types/result.ts";

/**
 * Circuit breaker states
 */
export type CircuitBreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold?: number; // Number of failures before opening
  successThreshold?: number; // Number of successes to close from half-open
  timeout?: number; // Time to wait before attempting recovery (ms)
  monitoringPeriod?: number; // Time window for failure tracking (ms)
  volumeThreshold?: number; // Minimum calls before circuit can open
  errorThresholdPercentage?: number; // Percentage of errors to open circuit
}

/**
 * Circuit breaker metrics
 */
export interface CircuitBreakerMetrics {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  totalCalls: number;
  errorRate: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  stateChangedAt: number;
  timeInCurrentState: number;
}

/**
 * Circuit breaker implementation for fault tolerance
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = "CLOSED";
  private failureCount = 0;
  private successCount = 0;
  private totalCalls = 0;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;
  private stateChangedAt = Date.now();
  private nextAttemptTime = 0;
  private config: Required<CircuitBreakerConfig>;
  private callHistory: Array<{ timestamp: number; success: boolean }> = [];

  constructor(private name: string, config: CircuitBreakerConfig = {}) {
    this.config = {
      failureThreshold: config.failureThreshold ?? 5,
      successThreshold: config.successThreshold ?? 2,
      timeout: config.timeout ?? 60_000, // 1 minute
      monitoringPeriod: config.monitoringPeriod ?? 60_000, // 1 minute
      volumeThreshold: config.volumeThreshold ?? 10,
      errorThresholdPercentage: config.errorThresholdPercentage ?? 50, // 50%
    };
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(
    fn: () => Promise<T>,
    fallback?: () => Promise<T> | T
  ): Promise<Result<T, Error>> {
    // Check if circuit is open and still in timeout
    if (this.state === "OPEN") {
      if (Date.now() < this.nextAttemptTime) {
        if (fallback) {
          try {
            const fallbackResult = await fallback();
            return Result.ok(fallbackResult);
          } catch (error) {
            return Result.err(new Error(`Circuit breaker open and fallback failed: ${error}`));
          }
        }
        return Result.err(new Error(`Circuit breaker '${this.name}' is OPEN`));
      } else {
        // Move to half-open state
        this.transitionTo("HALF_OPEN");
      }
    }

    try {
      const startTime = Date.now();
      const result = await fn();
      const duration = Date.now() - startTime;
      
      this.recordSuccess(duration);
      return Result.ok(result);
    } catch (error) {
      this.recordFailure();
      
      // Try fallback if available
      if (fallback) {
        try {
          const fallbackResult = await fallback();
          return Result.ok(fallbackResult);
        } catch (fallbackError) {
          return Result.err(new Error(`Primary and fallback failed: ${error}, ${fallbackError}`));
        }
      }
      
      return Result.err(error instanceof Error ? error : new Error("Circuit breaker execution failed"));
    }
  }

  /**
   * Get current circuit breaker metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    this.cleanupOldCalls();
    
    const now = Date.now();
    const recentCalls = this.getRecentCalls();
    const errorRate = recentCalls.length > 0 
      ? (recentCalls.filter(call => !call.success).length / recentCalls.length) * 100
      : 0;

    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalCalls: this.totalCalls,
      errorRate,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      stateChangedAt: this.stateChangedAt,
      timeInCurrentState: now - this.stateChangedAt,
    };
  }

  /**
   * Force circuit breaker to specific state
   */
  forceState(state: CircuitBreakerState): void {
    this.transitionTo(state);
  }

  /**
   * Reset circuit breaker to initial state
   */
  reset(): void {
    this.state = "CLOSED";
    this.failureCount = 0;
    this.successCount = 0;
    this.totalCalls = 0;
    this.lastFailureTime = undefined;
    this.lastSuccessTime = undefined;
    this.stateChangedAt = Date.now();
    this.nextAttemptTime = 0;
    this.callHistory = [];
  }

  /**
   * Check if circuit breaker allows calls
   */
  canExecute(): boolean {
    if (this.state === "CLOSED" || this.state === "HALF_OPEN") {
      return true;
    }
    
    if (this.state === "OPEN") {
      return Date.now() >= this.nextAttemptTime;
    }
    
    return false;
  }

  /**
   * Get circuit breaker name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Record successful execution
   */
  private recordSuccess(_duration?: number): void {
    this.totalCalls++;
    this.successCount++;
    this.lastSuccessTime = Date.now();
    
    this.callHistory.push({
      timestamp: Date.now(),
      success: true,
    });

    if (this.state === "HALF_OPEN") {
      if (this.successCount >= this.config.successThreshold) {
        this.transitionTo("CLOSED");
        this.failureCount = 0; // Reset failure count when closing
      }
    }
  }

  /**
   * Record failed execution
   */
  private recordFailure(): void {
    this.totalCalls++;
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    this.callHistory.push({
      timestamp: Date.now(),
      success: false,
    });

    if (this.state === "HALF_OPEN") {
      // Immediately open if failure in half-open state
      this.transitionTo("OPEN");
    } else if (this.state === "CLOSED") {
      // Check if we should open the circuit
      if (this.shouldOpenCircuit()) {
        this.transitionTo("OPEN");
      }
    }
  }

  /**
   * Check if circuit should be opened
   */
  private shouldOpenCircuit(): boolean {
    const recentCalls = this.getRecentCalls();
    
    // Not enough volume to make a decision
    if (recentCalls.length < this.config.volumeThreshold) {
      return false;
    }

    // Check error rate threshold
    const errors = recentCalls.filter(call => !call.success).length;
    const errorRate = (errors / recentCalls.length) * 100;
    
    return errorRate >= this.config.errorThresholdPercentage;
  }

  /**
   * Transition to new state
   */
  private transitionTo(newState: CircuitBreakerState): void {
    if (newState === this.state) return;

    const previousState = this.state;
    this.state = newState;
    this.stateChangedAt = Date.now();

    if (newState === "OPEN") {
      this.nextAttemptTime = Date.now() + this.config.timeout;
      this.successCount = 0; // Reset success count when opening
    } else if (newState === "HALF_OPEN") {
      this.successCount = 0; // Reset success count for half-open evaluation
    } else if (newState === "CLOSED") {
      this.failureCount = 0;
      this.successCount = 0;
      this.nextAttemptTime = 0;
    }

    console.log(`Circuit breaker '${this.name}' transitioned from ${previousState} to ${newState}`);
  }

  /**
   * Get recent calls within monitoring period
   */
  private getRecentCalls(): Array<{ timestamp: number; success: boolean }> {
    const cutoff = Date.now() - this.config.monitoringPeriod;
    return this.callHistory.filter(call => call.timestamp >= cutoff);
  }

  /**
   * Clean up old call history
   */
  private cleanupOldCalls(): void {
    const cutoff = Date.now() - this.config.monitoringPeriod * 2; // Keep double the monitoring period
    this.callHistory = this.callHistory.filter(call => call.timestamp >= cutoff);
  }
}

/**
 * Circuit breaker registry for managing multiple circuit breakers
 */
export class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>();

  /**
   * Get or create circuit breaker
   */
  getOrCreate(name: string, config?: CircuitBreakerConfig): CircuitBreaker {
    let breaker = this.breakers.get(name);
    
    if (!breaker) {
      breaker = new CircuitBreaker(name, config);
      this.breakers.set(name, breaker);
    }
    
    return breaker;
  }

  /**
   * Get circuit breaker by name
   */
  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  /**
   * Remove circuit breaker
   */
  remove(name: string): boolean {
    return this.breakers.delete(name);
  }

  /**
   * Get all circuit breaker names
   */
  getNames(): string[] {
    return Array.from(this.breakers.keys());
  }

  /**
   * Get all circuit breaker metrics
   */
  getAllMetrics(): Record<string, CircuitBreakerMetrics> {
    const metrics: Record<string, CircuitBreakerMetrics> = {};
    
    for (const [name, breaker] of this.breakers.entries()) {
      metrics[name] = breaker.getMetrics();
    }
    
    return metrics;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Get circuit breakers by state
   */
  getByState(state: CircuitBreakerState): CircuitBreaker[] {
    return Array.from(this.breakers.values())
      .filter(breaker => breaker.getMetrics().state === state);
  }

  /**
   * Get health status of all circuit breakers
   */
  getHealthStatus(): {
    healthy: number;
    degraded: number;
    failed: number;
    total: number;
  } {
    const closed = this.getByState("CLOSED").length;
    const halfOpen = this.getByState("HALF_OPEN").length;
    const open = this.getByState("OPEN").length;
    
    return {
      healthy: closed,
      degraded: halfOpen,
      failed: open,
      total: this.breakers.size,
    };
  }
}