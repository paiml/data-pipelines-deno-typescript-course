import { MetricsCollector } from "./metrics.ts";
import { Result } from "../types/result.ts";

/**
 * Performance monitoring configuration
 */
export interface PerformanceConfig {
  enabled?: boolean;
  metricsInterval?: number;
  alertThresholds?: {
    latencyP99?: number;
    errorRate?: number;
    memoryUsage?: number;
    cpuUsage?: number;
  };
  retentionPeriod?: number;
}

/**
 * Performance alert
 */
export interface PerformanceAlert {
  id: string;
  type: "latency" | "error_rate" | "memory" | "cpu" | "throughput";
  severity: "warning" | "critical";
  message: string;
  value: number;
  threshold: number;
  timestamp: number;
  resolved?: boolean;
}

/**
 * Performance snapshot
 */
export interface PerformanceSnapshot {
  timestamp: number;
  latency: {
    p50: number;
    p95: number;
    p99: number;
    avg: number;
  };
  throughput: {
    requestsPerSecond: number;
    recordsPerSecond: number;
  };
  errors: {
    count: number;
    rate: number;
  };
  memory: {
    used: number;
    total: number;
    usage: number; // percentage
  };
  cache: {
    hitRate: number;
    size: number;
  };
}

/**
 * Performance monitoring and alerting system
 */
export class PerformanceMonitor {
  private metrics: MetricsCollector;
  private config: Required<PerformanceConfig>;
  private alerts = new Map<string, PerformanceAlert>();
  private snapshots: PerformanceSnapshot[] = [];
  private isMonitoring = false;
  private monitoringInterval?: number;

  constructor(metricsCollector?: MetricsCollector, config: PerformanceConfig = {}) {
    this.metrics = metricsCollector ?? new MetricsCollector();
    this.config = {
      enabled: config.enabled ?? true,
      metricsInterval: config.metricsInterval ?? 10_000, // 10 seconds
      alertThresholds: {
        latencyP99: config.alertThresholds?.latencyP99 ?? 1000, // 1 second
        errorRate: config.alertThresholds?.errorRate ?? 0.05, // 5%
        memoryUsage: config.alertThresholds?.memoryUsage ?? 0.85, // 85%
        cpuUsage: config.alertThresholds?.cpuUsage ?? 0.80, // 80%
      },
      retentionPeriod: config.retentionPeriod ?? 3600_000, // 1 hour
    };

    this.setupDefaultMetrics();
  }

  /**
   * Start performance monitoring
   */
  start(): Result<void, Error> {
    try {
      if (this.isMonitoring || !this.config.enabled) {
        return Result.ok(undefined);
      }

      this.isMonitoring = true;
      this.metrics.start(5_000); // Start metrics collection every 5 seconds

      // Start performance monitoring
      this.monitoringInterval = setInterval(() => {
        this.collectPerformanceSnapshot();
        this.checkAlerts();
        this.cleanupOldData();
      }, this.config.metricsInterval);

      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Start monitoring failed"));
    }
  }

  /**
   * Stop performance monitoring
   */
  stop(): Result<void, Error> {
    try {
      if (!this.isMonitoring) {
        return Result.ok(undefined);
      }

      this.isMonitoring = false;
      this.metrics.stop();

      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
        this.monitoringInterval = undefined;
      }

      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Stop monitoring failed"));
    }
  }

  /**
   * Record request start
   */
  recordRequestStart(requestId: string, labels?: Record<string, string>): void {
    if (!this.config.enabled) return;

    this.metrics.incrementCounter("http_requests_total", 1, labels);
    
    // Store start time for duration calculation
    const startTime = Date.now();
    (globalThis as any).__requestTimes = (globalThis as any).__requestTimes || new Map();
    (globalThis as any).__requestTimes.set(requestId, startTime);
  }

  /**
   * Record request completion
   */
  recordRequestEnd(
    requestId: string,
    statusCode: number,
    labels?: Record<string, string>
  ): void {
    if (!this.config.enabled) return;

    // Calculate duration
    const startTime = (globalThis as any).__requestTimes?.get(requestId);
    if (startTime) {
      const duration = Date.now() - startTime;
      this.metrics.observeHistogram("http_request_duration_ms", duration, {
        ...labels,
        status_code: statusCode.toString(),
      });
      (globalThis as any).__requestTimes?.delete(requestId);
    }

    // Record response status
    this.metrics.incrementCounter("http_responses_total", 1, {
      ...labels,
      status_code: statusCode.toString(),
      status_class: `${Math.floor(statusCode / 100)}xx`,
    });

    // Record errors
    if (statusCode >= 400) {
      this.metrics.incrementCounter("http_errors_total", 1, {
        ...labels,
        status_code: statusCode.toString(),
      });
    }
  }

  /**
   * Record conversion operation
   */
  recordConversion(
    converterName: string,
    duration: number,
    success: boolean,
    inputSize?: number,
    labels?: Record<string, string>
  ): void {
    if (!this.config.enabled) return;

    const baseLabels = { converter: converterName, ...labels };

    this.metrics.observeHistogram("conversion_duration_ms", duration, baseLabels);
    this.metrics.incrementCounter("conversions_total", 1, {
      ...baseLabels,
      status: success ? "success" : "error",
    });

    if (inputSize !== undefined) {
      this.metrics.observeHistogram("conversion_input_size", inputSize, baseLabels);
    }

    if (!success) {
      this.metrics.incrementCounter("conversion_errors_total", 1, baseLabels);
    }
  }

  /**
   * Record cache operation
   */
  recordCacheOperation(
    operation: "hit" | "miss" | "set" | "delete",
    cacheName: string,
    duration?: number,
    labels?: Record<string, string>
  ): void {
    if (!this.config.enabled) return;

    const baseLabels = { cache: cacheName, operation, ...labels };

    this.metrics.incrementCounter("cache_operations_total", 1, baseLabels);

    if (duration !== undefined) {
      this.metrics.observeHistogram("cache_operation_duration_ms", duration, baseLabels);
    }

    if (operation === "hit" || operation === "miss") {
      this.metrics.incrementCounter(`cache_${operation}s_total`, 1, { cache: cacheName, ...labels });
    }
  }

  /**
   * Record memory usage
   */
  recordMemoryUsage(used: number, total: number, labels?: Record<string, string>): void {
    if (!this.config.enabled) return;

    this.metrics.setGauge("memory_used_bytes", used, labels);
    this.metrics.setGauge("memory_total_bytes", total, labels);
    this.metrics.setGauge("memory_usage_ratio", used / total, labels);
  }

  /**
   * Get current performance snapshot
   */
  getCurrentSnapshot(): PerformanceSnapshot | null {
    return this.snapshots[this.snapshots.length - 1] || null;
  }

  /**
   * Get performance snapshots within time range
   */
  getSnapshots(startTime?: number, endTime?: number): PerformanceSnapshot[] {
    const now = Date.now();
    const start = startTime ?? (now - 3600_000); // Last hour
    const end = endTime ?? now;

    return this.snapshots.filter(snapshot => 
      snapshot.timestamp >= start && snapshot.timestamp <= end
    );
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): PerformanceAlert[] {
    return Array.from(this.alerts.values()).filter(alert => !alert.resolved);
  }

  /**
   * Get all alerts
   */
  getAllAlerts(): PerformanceAlert[] {
    return Array.from(this.alerts.values());
  }

  /**
   * Resolve alert
   */
  resolveAlert(alertId: string): Result<void, Error> {
    try {
      const alert = this.alerts.get(alertId);
      if (!alert) {
        return Result.err(new Error(`Alert ${alertId} not found`));
      }

      alert.resolved = true;
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Resolve alert failed"));
    }
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(timeWindowMs: number = 300_000): any {
    const now = Date.now();
    const windowStart = now - timeWindowMs;
    const windowSnapshots = this.snapshots.filter(s => s.timestamp >= windowStart);

    if (windowSnapshots.length === 0) {
      return null;
    }

    const summary = {
      timeWindow: timeWindowMs,
      snapshots: windowSnapshots.length,
      latency: {
        p99: Math.max(...windowSnapshots.map(s => s.latency.p99)),
        p95: Math.max(...windowSnapshots.map(s => s.latency.p95)),
        avg: windowSnapshots.reduce((sum, s) => sum + s.latency.avg, 0) / windowSnapshots.length,
      },
      throughput: {
        requestsPerSecond: windowSnapshots.reduce((sum, s) => sum + s.throughput.requestsPerSecond, 0) / windowSnapshots.length,
        recordsPerSecond: windowSnapshots.reduce((sum, s) => sum + s.throughput.recordsPerSecond, 0) / windowSnapshots.length,
      },
      errors: {
        totalCount: windowSnapshots.reduce((sum, s) => sum + s.errors.count, 0),
        avgRate: windowSnapshots.reduce((sum, s) => sum + s.errors.rate, 0) / windowSnapshots.length,
        maxRate: Math.max(...windowSnapshots.map(s => s.errors.rate)),
      },
      memory: {
        maxUsage: Math.max(...windowSnapshots.map(s => s.memory.usage)),
        avgUsage: windowSnapshots.reduce((sum, s) => sum + s.memory.usage, 0) / windowSnapshots.length,
      },
      cache: {
        avgHitRate: windowSnapshots.reduce((sum, s) => sum + s.cache.hitRate, 0) / windowSnapshots.length,
      },
      alerts: {
        total: this.alerts.size,
        active: this.getActiveAlerts().length,
      },
    };

    return summary;
  }

  /**
   * Export metrics for external monitoring systems
   */
  exportMetrics(): any {
    return {
      prometheus: this.metrics.exportPrometheus(),
      json: this.metrics.exportJSON(),
      snapshots: this.snapshots.slice(-100), // Last 100 snapshots
      alerts: this.getAllAlerts(),
      summary: this.getPerformanceSummary(),
    };
  }

  /**
   * Setup default metrics
   */
  private setupDefaultMetrics(): void {
    // HTTP metrics
    this.metrics.registerMetric({
      name: "http_requests_total",
      type: "counter",
      help: "Total number of HTTP requests",
      labels: ["method", "path", "status_code"],
    });

    this.metrics.registerMetric({
      name: "http_request_duration_ms",
      type: "histogram",
      help: "HTTP request duration in milliseconds",
      labels: ["method", "path", "status_code"],
      unit: "ms",
    });

    // Conversion metrics
    this.metrics.registerMetric({
      name: "conversions_total",
      type: "counter",
      help: "Total number of conversions",
      labels: ["converter", "status"],
    });

    this.metrics.registerMetric({
      name: "conversion_duration_ms",
      type: "histogram",
      help: "Conversion duration in milliseconds",
      labels: ["converter"],
      unit: "ms",
    });

    // Cache metrics
    this.metrics.registerMetric({
      name: "cache_operations_total",
      type: "counter",
      help: "Total cache operations",
      labels: ["cache", "operation"],
    });

    this.metrics.registerMetric({
      name: "cache_hit_rate",
      type: "gauge",
      help: "Cache hit rate",
      labels: ["cache"],
    });

    // Memory metrics
    this.metrics.registerMetric({
      name: "memory_usage_ratio",
      type: "gauge",
      help: "Memory usage ratio",
    });
  }

  /**
   * Collect performance snapshot
   */
  private collectPerformanceSnapshot(): void {
    try {
      const now = Date.now();
      
      // Get latency metrics
      const latencyMetric = this.metrics.getMetric("http_request_duration_ms");
      const latency = {
        p50: 0,
        p95: 0,
        p99: 0,
        avg: 0,
      };

      if (latencyMetric?.histogram) {
        // Calculate percentiles from histogram
        latency.avg = latencyMetric.histogram.count > 0 
          ? latencyMetric.histogram.sum / latencyMetric.histogram.count 
          : 0;
        // Simplified percentile calculation
        latency.p99 = latency.avg * 2;
        latency.p95 = latency.avg * 1.5;
        latency.p50 = latency.avg;
      }

      // Get throughput
      const requestsMetric = this.metrics.getMetric("http_requests_total");
      const throughput = {
        requestsPerSecond: 0,
        recordsPerSecond: 0,
      };

      if (requestsMetric?.points.length) {
        const recentPoints = requestsMetric.points.filter(p => now - p.timestamp < 60_000);
        throughput.requestsPerSecond = recentPoints.length / 60;
      }

      // Get error metrics
      const errorsMetric = this.metrics.getMetric("http_errors_total");
      const errors = {
        count: errorsMetric?.points.length ?? 0,
        rate: 0,
      };

      if (requestsMetric?.points.length && errorsMetric?.points.length) {
        errors.rate = errorsMetric.points.length / requestsMetric.points.length;
      }

      // Get memory metrics
      const memoryUsed = this.metrics.getMetric("memory_heap_used_bytes");
      const memoryTotal = this.metrics.getMetric("memory_heap_total_bytes");
      const memory = {
        used: memoryUsed?.points[memoryUsed.points.length - 1]?.value ?? 0,
        total: memoryTotal?.points[memoryTotal.points.length - 1]?.value ?? 0,
        usage: 0,
      };
      memory.usage = memory.total > 0 ? memory.used / memory.total : 0;

      // Get cache metrics (simplified)
      const cache = {
        hitRate: 0.85, // Mock value
        size: 1000,    // Mock value
      };

      const snapshot: PerformanceSnapshot = {
        timestamp: now,
        latency,
        throughput,
        errors,
        memory,
        cache,
      };

      this.snapshots.push(snapshot);

      // Keep only recent snapshots
      const maxSnapshots = Math.ceil(this.config.retentionPeriod / this.config.metricsInterval);
      if (this.snapshots.length > maxSnapshots) {
        this.snapshots = this.snapshots.slice(-maxSnapshots);
      }
    } catch (error) {
      console.warn("Failed to collect performance snapshot:", error);
    }
  }

  /**
   * Check for performance alerts
   */
  private checkAlerts(): void {
    const snapshot = this.getCurrentSnapshot();
    if (!snapshot) return;

    // Check latency alert
    if (snapshot.latency.p99 > this.config.alertThresholds.latencyP99) {
      this.createAlert(
        "latency",
        "critical",
        `P99 latency (${snapshot.latency.p99}ms) exceeds threshold (${this.config.alertThresholds.latencyP99}ms)`,
        snapshot.latency.p99,
        this.config.alertThresholds.latencyP99
      );
    }

    // Check error rate alert
    if (snapshot.errors.rate > this.config.alertThresholds.errorRate) {
      this.createAlert(
        "error_rate",
        "warning",
        `Error rate (${(snapshot.errors.rate * 100).toFixed(2)}%) exceeds threshold (${(this.config.alertThresholds.errorRate * 100).toFixed(2)}%)`,
        snapshot.errors.rate,
        this.config.alertThresholds.errorRate
      );
    }

    // Check memory usage alert
    if (snapshot.memory.usage > this.config.alertThresholds.memoryUsage) {
      this.createAlert(
        "memory",
        "warning",
        `Memory usage (${(snapshot.memory.usage * 100).toFixed(2)}%) exceeds threshold (${(this.config.alertThresholds.memoryUsage * 100).toFixed(2)}%)`,
        snapshot.memory.usage,
        this.config.alertThresholds.memoryUsage
      );
    }
  }

  /**
   * Create performance alert
   */
  private createAlert(
    type: PerformanceAlert["type"],
    severity: PerformanceAlert["severity"],
    message: string,
    value: number,
    threshold: number
  ): void {
    const alertId = `${type}_${Date.now()}`;
    
    // Check if similar alert already exists
    const existingAlert = Array.from(this.alerts.values()).find(
      alert => alert.type === type && !alert.resolved
    );

    if (existingAlert) {
      // Update existing alert
      existingAlert.value = value;
      existingAlert.timestamp = Date.now();
      return;
    }

    const alert: PerformanceAlert = {
      id: alertId,
      type,
      severity,
      message,
      value,
      threshold,
      timestamp: Date.now(),
      resolved: false,
    };

    this.alerts.set(alertId, alert);
  }

  /**
   * Clean up old data
   */
  private cleanupOldData(): void {
    const now = Date.now();
    const cutoff = now - this.config.retentionPeriod;

    // Clean up old snapshots
    this.snapshots = this.snapshots.filter(snapshot => snapshot.timestamp > cutoff);

    // Clean up resolved alerts older than 1 hour
    for (const [id, alert] of this.alerts.entries()) {
      if (alert.resolved && alert.timestamp < (now - 3600_000)) {
        this.alerts.delete(id);
      }
    }
  }
}