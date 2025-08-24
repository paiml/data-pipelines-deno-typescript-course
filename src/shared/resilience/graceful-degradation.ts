import { Result } from "../types/result.ts";

/**
 * Service health status
 */
export type HealthStatus = "healthy" | "degraded" | "critical" | "down";

/**
 * Degradation strategy types
 */
export type DegradationStrategy = "fallback" | "circuit-breaker" | "rate-limit" | "feature-toggle" | "cache-only";

/**
 * Service health check result
 */
export interface HealthCheck {
  name: string;
  status: HealthStatus;
  responseTime: number;
  error?: Error;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

/**
 * Degradation rule configuration
 */
export interface DegradationRule {
  name: string;
  condition: (healthChecks: HealthCheck[]) => boolean;
  strategy: DegradationStrategy;
  fallbackFn?: () => Promise<unknown>;
  isEnabled: boolean;
  priority: number; // Higher priority rules are evaluated first
  cooldownPeriod?: number; // Time to wait before re-enabling (ms)
  maxActivations?: number; // Maximum times this rule can activate
  metadata?: Record<string, unknown>;
}

/**
 * Degradation state
 */
export interface DegradationState {
  isActive: boolean;
  activeRules: string[];
  activatedAt?: number;
  lastHealthCheck?: number;
  healthStatus: HealthStatus;
  failureCount: number;
  successCount: number;
  totalChecks: number;
}

/**
 * Health check function type
 */
export type HealthCheckFn = () => Promise<Result<HealthCheck, Error>>;

/**
 * Graceful degradation manager for handling service failures
 */
export class GracefulDegradation {
  private healthChecks = new Map<string, HealthCheckFn>();
  private degradationRules: DegradationRule[] = [];
  private state: DegradationState = {
    isActive: false,
    activeRules: [],
    healthStatus: "healthy",
    failureCount: 0,
    successCount: 0,
    totalChecks: 0,
  };
  private ruleActivations = new Map<string, number>();
  private ruleLastActivated = new Map<string, number>();
  private monitoringTimer?: number;

  constructor(
    private name: string,
    private config: {
      healthCheckInterval?: number; // Interval for health checks (ms)
      enableAutoMonitoring?: boolean; // Auto-run health checks
      defaultTimeout?: number; // Default timeout for health checks
      maxConcurrentChecks?: number; // Maximum concurrent health checks
    } = {}
  ) {
    this.config = {
      healthCheckInterval: config.healthCheckInterval ?? 30_000, // 30 seconds
      enableAutoMonitoring: config.enableAutoMonitoring ?? false,
      defaultTimeout: config.defaultTimeout ?? 5_000, // 5 seconds
      maxConcurrentChecks: config.maxConcurrentChecks ?? 5,
    };

    if (this.config.enableAutoMonitoring) {
      this.startMonitoring();
    }
  }

  /**
   * Register health check function
   */
  registerHealthCheck(name: string, healthCheckFn: HealthCheckFn): void {
    this.healthChecks.set(name, healthCheckFn);
  }

  /**
   * Remove health check
   */
  removeHealthCheck(name: string): boolean {
    return this.healthChecks.delete(name);
  }

  /**
   * Add degradation rule
   */
  addDegradationRule(rule: DegradationRule): void {
    this.degradationRules.push(rule);
    // Sort by priority (higher first)
    this.degradationRules.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Remove degradation rule
   */
  removeDegradationRule(name: string): boolean {
    const initialLength = this.degradationRules.length;
    this.degradationRules = this.degradationRules.filter(rule => rule.name !== name);
    return this.degradationRules.length < initialLength;
  }

  /**
   * Run all health checks
   */
  async runHealthChecks(): Promise<Result<HealthCheck[], Error>> {
    try {
      const healthCheckPromises: Promise<HealthCheck>[] = [];
      const startTime = Date.now();

      for (const [name, healthCheckFn] of this.healthChecks.entries()) {
        const healthCheckPromise = this.runSingleHealthCheck(name, healthCheckFn);
        healthCheckPromises.push(healthCheckPromise);

        // Limit concurrent checks
        if (healthCheckPromises.length >= (this.config.maxConcurrentChecks ?? 5)) {
          await Promise.all(healthCheckPromises);
          healthCheckPromises.length = 0; // Clear the array
        }
      }

      // Wait for remaining health checks
      if (healthCheckPromises.length > 0) {
        await Promise.all(healthCheckPromises);
      }

      // Collect all results
      const allResults: HealthCheck[] = [];
      for (const [name, healthCheckFn] of this.healthChecks.entries()) {
        try {
          const result = await this.runSingleHealthCheck(name, healthCheckFn);
          allResults.push(result);
        } catch (error) {
          allResults.push({
            name,
            status: "down",
            responseTime: Date.now() - startTime,
            error: error instanceof Error ? error : new Error(String(error)),
            timestamp: Date.now(),
          });
        }
      }

      // Update state
      this.updateHealthState(allResults);

      return Result.ok(allResults);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Health check failed"));
    }
  }

  /**
   * Evaluate degradation rules and activate if needed
   */
  async evaluateDegradation(healthChecks: HealthCheck[]): Promise<Result<boolean, Error>> {
    try {
      const previouslyActive = this.state.isActive;
      const newActiveRules: string[] = [];

      for (const rule of this.degradationRules) {
        if (!rule.isEnabled) continue;

        // Check cooldown period
        const lastActivated = this.ruleLastActivated.get(rule.name);
        if (lastActivated && rule.cooldownPeriod) {
          const timeSinceLastActivation = Date.now() - lastActivated;
          if (timeSinceLastActivation < rule.cooldownPeriod) {
            continue;
          }
        }

        // Check max activations
        if (rule.maxActivations) {
          const activations = this.ruleActivations.get(rule.name) ?? 0;
          if (activations >= rule.maxActivations) {
            continue;
          }
        }

        // Evaluate rule condition
        if (rule.condition(healthChecks)) {
          newActiveRules.push(rule.name);
          
          // Track activation
          const currentActivations = this.ruleActivations.get(rule.name) ?? 0;
          this.ruleActivations.set(rule.name, currentActivations + 1);
          this.ruleLastActivated.set(rule.name, Date.now());

          console.log(`Degradation rule '${rule.name}' activated with strategy: ${rule.strategy}`);
        }
      }

      // Update state
      this.state.isActive = newActiveRules.length > 0;
      this.state.activeRules = newActiveRules;

      if (!previouslyActive && this.state.isActive) {
        this.state.activatedAt = Date.now();
        console.log(`Graceful degradation activated for service '${this.name}'`);
      } else if (previouslyActive && !this.state.isActive) {
        console.log(`Graceful degradation deactivated for service '${this.name}'`);
      }

      return Result.ok(this.state.isActive);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Failed to evaluate degradation"));
    }
  }

  /**
   * Execute function with degradation handling
   */
  async executeWithDegradation<T>(
    fn: () => Promise<T>,
    options?: {
      fallback?: () => Promise<T>;
      skipHealthCheck?: boolean;
    }
  ): Promise<Result<T, Error>> {
    try {
      // Run health checks if not skipped
      if (!options?.skipHealthCheck) {
        const healthResult = await this.runHealthChecks();
        if (Result.isOk(healthResult)) {
          await this.evaluateDegradation(healthResult.value);
        }
      }

      // If degraded, try fallbacks first
      if (this.state.isActive) {
        for (const ruleName of this.state.activeRules) {
          const rule = this.degradationRules.find(r => r.name === ruleName);
          
          if (rule?.strategy === "fallback" && rule.fallbackFn) {
            try {
              const fallbackResult = await rule.fallbackFn();
              return Result.ok(fallbackResult as T);
            } catch (fallbackError) {
              console.warn(`Fallback failed for rule '${ruleName}':`, fallbackError);
            }
          }

          if (rule?.strategy === "circuit-breaker") {
            // Circuit breaker is open, use fallback if available
            if (options?.fallback) {
              try {
                const fallbackResult = await options.fallback();
                return Result.ok(fallbackResult);
              } catch (fallbackError) {
                return Result.err(new Error(`Service degraded and fallback failed: ${fallbackError}`));
              }
            }
            return Result.err(new Error(`Service degraded and no fallback available`));
          }

          if (rule?.strategy === "cache-only") {
            // Try cache-only mode (would integrate with cache system)
            console.log(`Operating in cache-only mode due to rule '${ruleName}'`);
          }
        }
      }

      // Try normal execution
      const result = await fn();
      this.recordSuccess();
      return Result.ok(result);
    } catch (error) {
      this.recordFailure();
      
      // Try provided fallback
      if (options?.fallback) {
        try {
          const fallbackResult = await options.fallback();
          return Result.ok(fallbackResult);
        } catch (fallbackError) {
          return Result.err(new Error(`Primary and fallback failed: ${error}, ${fallbackError}`));
        }
      }

      return Result.err(error instanceof Error ? error : new Error("Execution failed"));
    }
  }

  /**
   * Get current degradation state
   */
  getState(): DegradationState {
    return { ...this.state };
  }

  /**
   * Get health status
   */
  getHealthStatus(): HealthStatus {
    return this.state.healthStatus;
  }

  /**
   * Check if service is degraded
   */
  isDegraded(): boolean {
    return this.state.isActive;
  }

  /**
   * Get active degradation rules
   */
  getActiveRules(): DegradationRule[] {
    return this.degradationRules.filter(rule => 
      this.state.activeRules.includes(rule.name)
    );
  }

  /**
   * Get all degradation rules
   */
  getAllRules(): DegradationRule[] {
    return [...this.degradationRules];
  }

  /**
   * Enable/disable rule
   */
  toggleRule(name: string, enabled: boolean): boolean {
    const rule = this.degradationRules.find(r => r.name === name);
    if (rule) {
      rule.isEnabled = enabled;
      return true;
    }
    return false;
  }

  /**
   * Reset rule activation counters
   */
  resetRuleCounters(): void {
    this.ruleActivations.clear();
    this.ruleLastActivated.clear();
  }

  /**
   * Start automatic monitoring
   */
  startMonitoring(): void {
    if (this.monitoringTimer) return;

    this.monitoringTimer = setInterval(async () => {
      const healthResult = await this.runHealthChecks();
      if (Result.isOk(healthResult)) {
        await this.evaluateDegradation(healthResult.value);
      }
    }, this.config.healthCheckInterval);

    console.log(`Started automatic monitoring for service '${this.name}'`);
  }

  /**
   * Stop automatic monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = undefined;
      console.log(`Stopped automatic monitoring for service '${this.name}'`);
    }
  }

  /**
   * Reset degradation state
   */
  reset(): void {
    this.state = {
      isActive: false,
      activeRules: [],
      healthStatus: "healthy",
      failureCount: 0,
      successCount: 0,
      totalChecks: 0,
    };
    this.resetRuleCounters();
  }

  /**
   * Close and cleanup
   */
  close(): void {
    this.stopMonitoring();
    this.reset();
  }

  /**
   * Get service name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Run single health check with timeout
   */
  private async runSingleHealthCheck(name: string, healthCheckFn: HealthCheckFn): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const timeoutMs = this.config.defaultTimeout ?? 5_000;
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Health check timeout")), timeoutMs);
      });

      const result = await Promise.race([
        healthCheckFn(),
        timeoutPromise
      ]);

      if (Result.isErr(result)) {
        return {
          name,
          status: "down",
          responseTime: Date.now() - startTime,
          error: result.error,
          timestamp: Date.now(),
        };
      }

      return result.value;
    } catch (error) {
      return {
        name,
        status: "down",
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error)),
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Update overall health state based on health checks
   */
  private updateHealthState(healthChecks: HealthCheck[]): void {
    this.state.lastHealthCheck = Date.now();
    this.state.totalChecks++;

    if (healthChecks.length === 0) {
      this.state.healthStatus = "healthy";
      return;
    }

    const degradedCount = healthChecks.filter(hc => hc.status === "degraded").length;
    const criticalCount = healthChecks.filter(hc => hc.status === "critical").length;
    const downCount = healthChecks.filter(hc => hc.status === "down").length;

    // Determine overall health status
    if (downCount > 0 || criticalCount > healthChecks.length / 2) {
      this.state.healthStatus = "critical";
      this.recordFailure();
    } else if (criticalCount > 0 || degradedCount > healthChecks.length / 2) {
      this.state.healthStatus = "degraded";
      this.recordFailure();
    } else if (degradedCount > 0) {
      this.state.healthStatus = "degraded";
    } else {
      this.state.healthStatus = "healthy";
      this.recordSuccess();
    }
  }

  /**
   * Record successful operation
   */
  private recordSuccess(): void {
    this.state.successCount++;
  }

  /**
   * Record failed operation
   */
  private recordFailure(): void {
    this.state.failureCount++;
  }
}

/**
 * Predefined degradation rules
 */
export class DegradationRules {
  /**
   * High error rate rule
   */
  static highErrorRate(threshold: number = 0.5): DegradationRule {
    return {
      name: "high_error_rate",
      condition: (healthChecks) => {
        const failedChecks = healthChecks.filter(hc => hc.status === "down" || hc.status === "critical").length;
        return healthChecks.length > 0 && (failedChecks / healthChecks.length) > threshold;
      },
      strategy: "circuit-breaker",
      isEnabled: true,
      priority: 100,
      cooldownPeriod: 60_000, // 1 minute
    };
  }

  /**
   * High latency rule
   */
  static highLatency(thresholdMs: number = 5000): DegradationRule {
    return {
      name: "high_latency",
      condition: (healthChecks) => {
        const avgResponseTime = healthChecks.reduce((sum, hc) => sum + hc.responseTime, 0) / healthChecks.length;
        return avgResponseTime > thresholdMs;
      },
      strategy: "rate-limit",
      isEnabled: true,
      priority: 80,
      cooldownPeriod: 30_000, // 30 seconds
    };
  }

  /**
   * Service completely down rule
   */
  static serviceDown(): DegradationRule {
    return {
      name: "service_down",
      condition: (healthChecks) => {
        return healthChecks.length > 0 && healthChecks.every(hc => hc.status === "down");
      },
      strategy: "fallback",
      isEnabled: true,
      priority: 200, // Highest priority
      cooldownPeriod: 120_000, // 2 minutes
    };
  }

  /**
   * Partial service degradation rule
   */
  static partialDegradation(threshold: number = 0.3): DegradationRule {
    return {
      name: "partial_degradation",
      condition: (healthChecks) => {
        const degradedChecks = healthChecks.filter(hc => 
          hc.status === "degraded" || hc.status === "critical"
        ).length;
        return healthChecks.length > 0 && (degradedChecks / healthChecks.length) > threshold;
      },
      strategy: "feature-toggle",
      isEnabled: true,
      priority: 60,
      cooldownPeriod: 45_000, // 45 seconds
    };
  }
}

/**
 * Graceful degradation manager for multiple services
 */
export class DegradationManager {
  private services = new Map<string, GracefulDegradation>();

  /**
   * Register service for degradation management
   */
  registerService(service: GracefulDegradation): void {
    this.services.set(service.getName(), service);
  }

  /**
   * Remove service
   */
  removeService(name: string): boolean {
    const service = this.services.get(name);
    if (service) {
      service.close();
      return this.services.delete(name);
    }
    return false;
  }

  /**
   * Get service by name
   */
  getService(name: string): GracefulDegradation | undefined {
    return this.services.get(name);
  }

  /**
   * Get all service names
   */
  getServiceNames(): string[] {
    return Array.from(this.services.keys());
  }

  /**
   * Get overall system health
   */
  getSystemHealth(): {
    overall: HealthStatus;
    services: Record<string, HealthStatus>;
    degradedServices: string[];
    healthyServices: string[];
  } {
    const serviceHealth: Record<string, HealthStatus> = {};
    const degradedServices: string[] = [];
    const healthyServices: string[] = [];

    for (const [name, service] of this.services.entries()) {
      const status = service.getHealthStatus();
      serviceHealth[name] = status;

      if (status === "degraded" || status === "critical" || status === "down") {
        degradedServices.push(name);
      } else {
        healthyServices.push(name);
      }
    }

    // Determine overall system health
    let overall: HealthStatus = "healthy";
    if (degradedServices.length === this.services.size) {
      overall = "down";
    } else if (degradedServices.length > this.services.size / 2) {
      overall = "critical";
    } else if (degradedServices.length > 0) {
      overall = "degraded";
    }

    return {
      overall,
      services: serviceHealth,
      degradedServices,
      healthyServices,
    };
  }

  /**
   * Start monitoring for all services
   */
  startAllMonitoring(): void {
    for (const service of this.services.values()) {
      service.startMonitoring();
    }
  }

  /**
   * Stop monitoring for all services
   */
  stopAllMonitoring(): void {
    for (const service of this.services.values()) {
      service.stopMonitoring();
    }
  }

  /**
   * Close all services
   */
  closeAll(): void {
    for (const service of this.services.values()) {
      service.close();
    }
    this.services.clear();
  }
}