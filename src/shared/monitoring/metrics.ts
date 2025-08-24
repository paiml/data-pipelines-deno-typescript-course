import { Result } from "../types/result.ts";

/**
 * Metric types
 */
export type MetricType = "counter" | "gauge" | "histogram" | "summary";

/**
 * Metric data point
 */
export interface MetricPoint {
  value: number;
  timestamp: number;
  labels?: Record<string, string>;
}

/**
 * Histogram bucket
 */
export interface HistogramBucket {
  le: number; // Less than or equal to
  count: number;
}

/**
 * Histogram data
 */
export interface HistogramData {
  sum: number;
  count: number;
  buckets: HistogramBucket[];
}

/**
 * Summary quantile
 */
export interface SummaryQuantile {
  quantile: number;
  value: number;
}

/**
 * Summary data
 */
export interface SummaryData {
  sum: number;
  count: number;
  quantiles: SummaryQuantile[];
}

/**
 * Metric definition
 */
export interface Metric {
  name: string;
  type: MetricType;
  help: string;
  labels?: string[];
  unit?: string;
}

/**
 * Metric value
 */
export interface MetricValue {
  metric: Metric;
  points: MetricPoint[];
  histogram?: HistogramData;
  summary?: SummaryData;
}

/**
 * Performance metrics collector
 */
export class MetricsCollector {
  private metrics = new Map<string, MetricValue>();
  private defaultLabels = new Map<string, string>();
  private collectors = new Set<() => void>();
  private isCollecting = false;
  private collectionInterval?: number;

  constructor() {
    // Set default labels
    this.defaultLabels.set("instance", `pipeline-${Date.now()}`);
    this.defaultLabels.set("version", "1.0.0");
  }

  /**
   * Start metrics collection
   */
  start(intervalMs: number = 15_000): void {
    if (this.isCollecting) return;
    
    this.isCollecting = true;
    this.collectionInterval = setInterval(() => {
      this.runCollectors();
    }, intervalMs);

    // Collect initial metrics
    this.runCollectors();
  }

  /**
   * Stop metrics collection
   */
  stop(): void {
    if (!this.isCollecting) return;
    
    this.isCollecting = false;
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = undefined;
    }
  }

  /**
   * Add default label
   */
  addDefaultLabel(key: string, value: string): void {
    this.defaultLabels.set(key, value);
  }

  /**
   * Register a metric
   */
  registerMetric(metric: Metric): Result<void, Error> {
    try {
      if (this.metrics.has(metric.name)) {
        return Result.err(new Error(`Metric ${metric.name} already registered`));
      }

      this.metrics.set(metric.name, {
        metric,
        points: [],
        histogram: metric.type === "histogram" ? {
          sum: 0,
          count: 0,
          buckets: this.createDefaultBuckets(),
        } : undefined,
        summary: metric.type === "summary" ? {
          sum: 0,
          count: 0,
          quantiles: this.createDefaultQuantiles(),
        } : undefined,
      });

      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error instanceof Error ? error : new Error("Register metric failed"));
    }
  }

  /**
   * Increment counter
   */
  incrementCounter(name: string, value: number = 1, labels?: Record<string, string>): void {
    this.recordMetric(name, "counter", value, labels);
  }

  /**
   * Set gauge value
   */
  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    this.recordMetric(name, "gauge", value, labels);
  }

  /**
   * Observe histogram value
   */
  observeHistogram(name: string, value: number, labels?: Record<string, string>): void {
    this.recordMetric(name, "histogram", value, labels);
    this.updateHistogram(name, value, labels);
  }

  /**
   * Observe summary value
   */
  observeSummary(name: string, value: number, labels?: Record<string, string>): void {
    this.recordMetric(name, "summary", value, labels);
    this.updateSummary(name, value, labels);
  }

  /**
   * Record timing (convenience method for histograms)
   */
  recordTiming(name: string, startTime: number, labels?: Record<string, string>): void {
    const duration = Date.now() - startTime;
    this.observeHistogram(name, duration, labels);
  }

  /**
   * Time a function execution
   */
  async timed<T>(name: string, fn: () => Promise<T>, labels?: Record<string, string>): Promise<T> {
    const startTime = Date.now();
    try {
      const result = await fn();
      this.recordTiming(name, startTime, { ...labels, status: "success" });
      return result;
    } catch (error) {
      this.recordTiming(name, startTime, { ...labels, status: "error" });
      throw error;
    }
  }

  /**
   * Get all metrics
   */
  getMetrics(): MetricValue[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Get specific metric
   */
  getMetric(name: string): MetricValue | undefined {
    return this.metrics.get(name);
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheus(): string {
    const lines: string[] = [];
    
    for (const metricValue of this.metrics.values()) {
      const { metric, points, histogram, summary } = metricValue;
      
      // Add help and type comments
      lines.push(`# HELP ${metric.name} ${metric.help}`);
      lines.push(`# TYPE ${metric.name} ${metric.type}`);

      if (metric.type === "histogram" && histogram) {
        // Export histogram buckets
        for (const bucket of histogram.buckets) {
          const labels = this.formatLabels({ le: bucket.le.toString() });
          lines.push(`${metric.name}_bucket${labels} ${bucket.count}`);
        }
        lines.push(`${metric.name}_sum ${histogram.sum}`);
        lines.push(`${metric.name}_count ${histogram.count}`);
      } else if (metric.type === "summary" && summary) {
        // Export summary quantiles
        for (const quantile of summary.quantiles) {
          const labels = this.formatLabels({ quantile: quantile.quantile.toString() });
          lines.push(`${metric.name}${labels} ${quantile.value}`);
        }
        lines.push(`${metric.name}_sum ${summary.sum}`);
        lines.push(`${metric.name}_count ${summary.count}`);
      } else {
        // Export regular metrics
        for (const point of points) {
          const labels = this.formatLabels(point.labels);
          lines.push(`${metric.name}${labels} ${point.value} ${point.timestamp}`);
        }
      }
      
      lines.push(""); // Empty line between metrics
    }

    return lines.join("\n");
  }

  /**
   * Export metrics as JSON
   */
  exportJSON(): any {
    const metrics: any = {};
    
    for (const [name, metricValue] of this.metrics.entries()) {
      metrics[name] = {
        type: metricValue.metric.type,
        help: metricValue.metric.help,
        unit: metricValue.metric.unit,
        points: metricValue.points,
        histogram: metricValue.histogram,
        summary: metricValue.summary,
      };
    }

    return {
      timestamp: Date.now(),
      defaultLabels: Object.fromEntries(this.defaultLabels),
      metrics,
    };
  }

  /**
   * Clear all metrics data
   */
  clear(): void {
    for (const metricValue of this.metrics.values()) {
      metricValue.points = [];
      if (metricValue.histogram) {
        metricValue.histogram.sum = 0;
        metricValue.histogram.count = 0;
        metricValue.histogram.buckets.forEach(bucket => bucket.count = 0);
      }
      if (metricValue.summary) {
        metricValue.summary.sum = 0;
        metricValue.summary.count = 0;
        metricValue.summary.quantiles.forEach(q => q.value = 0);
      }
    }
  }

  /**
   * Add a custom collector function
   */
  addCollector(collector: () => void): void {
    this.collectors.add(collector);
  }

  /**
   * Remove a collector function
   */
  removeCollector(collector: () => void): void {
    this.collectors.delete(collector);
  }

  /**
   * Get system metrics
   */
  collectSystemMetrics(): void {
    // Memory usage
    if (typeof Deno !== "undefined" && Deno.memoryUsage) {
      const memory = Deno.memoryUsage();
      this.setGauge("memory_rss_bytes", memory.rss);
      this.setGauge("memory_heap_total_bytes", memory.heapTotal);
      this.setGauge("memory_heap_used_bytes", memory.heapUsed);
      this.setGauge("memory_external_bytes", memory.external);
    }

    // Process uptime
    this.setGauge("process_uptime_seconds", Date.now() / 1000);
  }

  /**
   * Record metric point
   */
  private recordMetric(
    name: string,
    type: MetricType,
    value: number,
    labels?: Record<string, string>
  ): void {
    let metricValue = this.metrics.get(name);
    
    if (!metricValue) {
      // Auto-register metric
      const metric: Metric = {
        name,
        type,
        help: `Auto-generated metric: ${name}`,
      };
      
      metricValue = {
        metric,
        points: [],
        histogram: type === "histogram" ? {
          sum: 0,
          count: 0,
          buckets: this.createDefaultBuckets(),
        } : undefined,
        summary: type === "summary" ? {
          sum: 0,
          count: 0,
          quantiles: this.createDefaultQuantiles(),
        } : undefined,
      };
      
      this.metrics.set(name, metricValue);
    }

    // Merge with default labels
    const mergedLabels = { ...Object.fromEntries(this.defaultLabels), ...labels };

    // Add point
    const point: MetricPoint = {
      value,
      timestamp: Date.now(),
      labels: Object.keys(mergedLabels).length > 0 ? mergedLabels : undefined,
    };

    // Keep only recent points to prevent memory leaks
    metricValue.points.push(point);
    if (metricValue.points.length > 1000) {
      metricValue.points = metricValue.points.slice(-500); // Keep last 500 points
    }
  }

  /**
   * Update histogram data
   */
  private updateHistogram(name: string, value: number, labels?: Record<string, string>): void {
    const metricValue = this.metrics.get(name);
    if (!metricValue?.histogram) return;

    const histogram = metricValue.histogram;
    histogram.sum += value;
    histogram.count++;

    // Update buckets
    for (const bucket of histogram.buckets) {
      if (value <= bucket.le) {
        bucket.count++;
      }
    }
  }

  /**
   * Update summary data
   */
  private updateSummary(name: string, value: number, labels?: Record<string, string>): void {
    const metricValue = this.metrics.get(name);
    if (!metricValue?.summary) return;

    const summary = metricValue.summary;
    summary.sum += value;
    summary.count++;

    // For simplicity, we're not maintaining sliding window quantiles
    // In production, you'd use a more sophisticated quantile estimation algorithm
  }

  /**
   * Create default histogram buckets
   */
  private createDefaultBuckets(): HistogramBucket[] {
    const buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, Infinity];
    return buckets.map(le => ({ le, count: 0 }));
  }

  /**
   * Create default summary quantiles
   */
  private createDefaultQuantiles(): SummaryQuantile[] {
    const quantiles = [0.5, 0.9, 0.95, 0.99, 0.999];
    return quantiles.map(quantile => ({ quantile, value: 0 }));
  }

  /**
   * Format labels for Prometheus export
   */
  private formatLabels(labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return "";
    }

    const formatted = Object.entries(labels)
      .map(([key, value]) => `${key}="${value}"`)
      .join(",");

    return `{${formatted}}`;
  }

  /**
   * Run all registered collectors
   */
  private runCollectors(): void {
    try {
      // Collect system metrics
      this.collectSystemMetrics();

      // Run custom collectors
      for (const collector of this.collectors) {
        try {
          collector();
        } catch (error) {
          console.warn("Collector error:", error);
        }
      }
    } catch (error) {
      console.warn("Metrics collection error:", error);
    }
  }
}