import { assertEquals, assertExists } from "@std/assert";
import { MetricsCollector } from "../../../src/shared/monitoring/metrics.ts";
import { Result } from "../../../src/shared/types/result.ts";

Deno.test("MetricsCollector", async (t) => {
  await t.step("should register and record metrics", async () => {
    const collector = new MetricsCollector();
    
    const registerResult = collector.registerMetric({
      name: "test_counter",
      type: "counter",
      help: "Test counter metric",
    });
    
    assertEquals(Result.isOk(registerResult), true);
    
    collector.incrementCounter("test_counter", 5);
    collector.incrementCounter("test_counter", 3);
    
    const metric = collector.getMetric("test_counter");
    assertExists(metric);
    assertEquals(metric.points.length, 2);
    assertEquals(metric.points[0].value, 5);
    assertEquals(metric.points[1].value, 3);
  });

  await t.step("should handle gauge metrics", async () => {
    const collector = new MetricsCollector();
    
    collector.setGauge("memory_usage", 1024);
    collector.setGauge("memory_usage", 2048);
    
    const metric = collector.getMetric("memory_usage");
    assertExists(metric);
    assertEquals(metric.points.length, 2);
    assertEquals(metric.points[1].value, 2048);
  });

  await t.step("should handle histogram metrics", async () => {
    const collector = new MetricsCollector();
    
    collector.observeHistogram("request_duration", 100);
    collector.observeHistogram("request_duration", 200);
    collector.observeHistogram("request_duration", 50);
    
    const metric = collector.getMetric("request_duration");
    assertExists(metric);
    assertExists(metric.histogram);
    assertEquals(metric.histogram.count, 3);
    assertEquals(metric.histogram.sum, 350);
  });

  await t.step("should support labels", async () => {
    const collector = new MetricsCollector();
    
    collector.incrementCounter("requests", 1, { method: "GET", status: "200" });
    collector.incrementCounter("requests", 1, { method: "POST", status: "201" });
    
    const metric = collector.getMetric("requests");
    assertExists(metric);
    assertEquals(metric.points.length, 2);
    assertEquals(metric.points[0].labels?.method, "GET");
    assertEquals(metric.points[1].labels?.method, "POST");
  });

  await t.step("should time function execution", async () => {
    const collector = new MetricsCollector();
    
    const result = await collector.timed("slow_operation", async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      return "completed";
    });
    
    assertEquals(result, "completed");
    
    const metric = collector.getMetric("slow_operation");
    assertExists(metric);
    assertEquals(metric.points.length, 1);
    // Duration should be around 50ms
    assertEquals(metric.points[0].value > 40, true);
  });

  await t.step("should export Prometheus format", async () => {
    const collector = new MetricsCollector();
    
    collector.incrementCounter("test_total", 10, { job: "test" });
    collector.setGauge("memory_bytes", 1048576);
    
    const prometheus = collector.exportPrometheus();
    
    assertEquals(prometheus.includes("test_total"), true);
    assertEquals(prometheus.includes("memory_bytes"), true);
    assertEquals(prometheus.includes("1048576"), true);
  });

  await t.step("should export JSON format", async () => {
    const collector = new MetricsCollector();
    
    collector.incrementCounter("api_calls", 5);
    collector.setGauge("cpu_usage", 0.75);
    
    const json = collector.exportJSON();
    
    assertExists(json.timestamp);
    assertExists(json.metrics);
    assertExists(json.metrics.api_calls);
    assertExists(json.metrics.cpu_usage);
    assertEquals(json.metrics.api_calls.type, "counter");
    assertEquals(json.metrics.cpu_usage.type, "gauge");
  });

  await t.step("should clear metrics", async () => {
    const collector = new MetricsCollector();
    
    collector.incrementCounter("clear_test", 100);
    collector.setGauge("clear_gauge", 50);
    
    let metrics = collector.getMetrics();
    assertEquals(metrics.length > 0, true);
    
    collector.clear();
    
    const clearTestMetric = collector.getMetric("clear_test");
    const clearGaugeMetric = collector.getMetric("clear_gauge");
    
    assertExists(clearTestMetric);
    assertExists(clearGaugeMetric);
    assertEquals(clearTestMetric.points.length, 0);
    assertEquals(clearGaugeMetric.points.length, 0);
  });

  await t.step("should collect system metrics", async () => {
    const collector = new MetricsCollector();
    
    collector.collectSystemMetrics();
    
    const uptimeMetric = collector.getMetric("process_uptime_seconds");
    assertExists(uptimeMetric);
    assertEquals(uptimeMetric.points.length > 0, true);
  });
});