// Deno Benchmark Suite for EU-USA Data Pipeline
// This suite tests internal component performance using Deno's built-in benchmark tools

import { EurToUsdConverter } from "../../src/converters/currency/eur-to-usd.ts";
import { MetricToImperialConverter } from "../../src/converters/units/metric-to-imperial.ts";
import { EuToUsaDateConverter } from "../../src/converters/dates/eu-to-usa-date.ts";
import { CacheManager } from "../../src/shared/cache/cache-manager.ts";
import { WorkerPool } from "../../src/shared/workers/worker-pool.ts";
import { CircuitBreaker } from "../../src/shared/resilience/circuit-breaker.ts";
import { RetryPolicy } from "../../src/shared/resilience/retry-policy.ts";
import { MetricsCollector } from "../../src/shared/monitoring/metrics.ts";

// Test data generators
function generateCurrencyData(count: number) {
  const currencies = ["EUR", "USD", "GBP"];
  return Array.from({ length: count }, (_) => ({
    amount: Math.random() * 1000,
    from: currencies[Math.floor(Math.random() * currencies.length)],
    to: currencies[Math.floor(Math.random() * currencies.length)],
  }));
}

function generateUnitData(count: number) {
  const units = [
    { from: "km", to: "miles" },
    { from: "kg", to: "lbs" },
    { from: "celsius", to: "fahrenheit" },
    { from: "liters", to: "gallons" },
  ];
  return Array.from({ length: count }, (_) => ({
    value: Math.random() * 100,
    ...units[Math.floor(Math.random() * units.length)],
  }));
}

function generateDateData(count: number) {
  return Array.from({ length: count }, (_) => ({
    date: `${String(Math.floor(Math.random() * 28) + 1).padStart(2, "0")}/${String(Math.floor(Math.random() * 12) + 1).padStart(2, "0")}/2025`,
    fromFormat: "DD/MM/YYYY",
    toFormat: "MM/DD/YYYY",
  }));
}

// Benchmark: Currency Conversion Performance
Deno.bench("Currency Conversion - Single", { group: "converters" }, async () => {
  const converter = new EurToUsdConverter({});
  await converter.convert({ amount: 100 });
});

Deno.bench("Currency Conversion - Batch 100", { group: "converters" }, async () => {
  const converter = new EurToUsdConverter({});
  const data = generateCurrencyData(100);
  
  await Promise.all(
    data.map(item => converter.convert({ amount: item.amount }))
  );
});

Deno.bench("Currency Conversion - Batch 1000", { group: "converters" }, async () => {
  const converter = new EurToUsdConverter({});
  const data = generateCurrencyData(1000);
  
  await Promise.all(
    data.map(item => converter.convert({ amount: item.amount }))
  );
});

// Benchmark: Unit Conversion Performance
Deno.bench("Unit Conversion - Single", { group: "converters" }, () => {
  const converter = new MetricToImperialConverter({});
  converter.convert({ value: 100, unit: "km" });
});

Deno.bench("Unit Conversion - Batch 1000", { group: "converters" }, () => {
  const converter = new MetricToImperialConverter({});
  const data = generateUnitData(1000);
  
  data.forEach(item => converter.convert({ value: item.value, unit: "km" }));
});

Deno.bench("Unit Conversion - Batch 10000", { group: "converters" }, () => {
  const converter = new MetricToImperialConverter({});
  const data = generateUnitData(10000);
  
  data.forEach(item => converter.convert({ value: item.value, unit: "km" }));
});

// Benchmark: Date Conversion Performance  
Deno.bench("Date Conversion - Single", { group: "converters" }, () => {
  const converter = new EuToUsaDateConverter({});
  converter.convert({ date: "24/08/2025" });
});

Deno.bench("Date Conversion - Batch 1000", { group: "converters" }, () => {
  const converter = new EuToUsaDateConverter({});
  const data = generateDateData(1000);
  
  data.forEach(item => converter.convert({ date: item.date }));
});

// Benchmark: Cache Performance
Deno.bench("Cache - Set Operations", { group: "performance" }, () => {
  const cache = new CacheManager();
  
  for (let i = 0; i < 1000; i++) {
    cache.set(`key-${i}`, { value: i }, 300);
  }
});

Deno.bench("Cache - Get Operations", { group: "performance" }, () => {
  const cache = new CacheManager();
  
  // Pre-populate cache
  for (let i = 0; i < 1000; i++) {
    cache.set(`key-${i}`, { value: i }, 300);
  }
  
  // Benchmark gets
  for (let i = 0; i < 1000; i++) {
    cache.get(`key-${i}`);
  }
});

Deno.bench("Cache - Mixed Operations", { group: "performance" }, () => {
  const cache = new CacheManager();
  
  for (let i = 0; i < 1000; i++) {
    if (i % 3 === 0) {
      cache.set(`key-${i}`, { value: i }, 300);
    } else if (i % 3 === 1) {
      cache.get(`key-${i % 100}`);
    } else {
      cache.delete(`key-${i % 100}`);
    }
  }
});

// Benchmark: Worker Pool Performance
Deno.bench("Worker Pool - Task Processing", { group: "performance" }, async () => {
  const pool = new WorkerPool(4);
  
  const tasks = Array.from({ length: 100 }, (_) => 
    async () => {
      // Simulate CPU work
      let sum = 0;
      for (let j = 0; j < 1000; j++) {
        sum += Math.random();
      }
      return sum;
    }
  );
  
  await Promise.all(tasks.map(task => pool.execute(task)));
  pool.terminate();
});

// Benchmark: Circuit Breaker Performance
Deno.bench("Circuit Breaker - Success Path", { group: "resilience" }, async () => {
  const breaker = new CircuitBreaker("test-breaker");
  
  for (let i = 0; i < 100; i++) {
    await breaker.execute(async () => {
      return { success: true, data: i };
    });
  }
});

Deno.bench("Circuit Breaker - Mixed Results", { group: "resilience" }, async () => {
  const breaker = new CircuitBreaker("test-mixed");
  
  for (let i = 0; i < 100; i++) {
    try {
      await breaker.execute(async () => {
        if (Math.random() < 0.8) { // 80% success rate
          return { success: true, data: i };
        } else {
          throw new Error("Simulated failure");
        }
      });
    } catch {
      // Expected failures
    }
  }
});

// Benchmark: Retry Policy Performance
Deno.bench("Retry Policy - Success Path", { group: "resilience" }, async () => {
  const policy = new RetryPolicy({
    strategy: "exponential",
    maxAttempts: 3,
    initialDelay: 100
  });
  
  for (let i = 0; i < 50; i++) {
    await policy.execute(async () => {
      return { success: true, data: i };
    });
  }
});

Deno.bench("Retry Policy - With Retries", { group: "resilience" }, async () => {
  const policy = new RetryPolicy({ 
    strategy: "exponential",
    maxAttempts: 3,
    initialDelay: 100
  });
  let attempts = 0;
  
  for (let i = 0; i < 20; i++) {
    try {
      await policy.execute(async () => {
        attempts++;
        if (attempts % 3 === 0) { // Succeed every 3rd attempt
          return { success: true, data: i };
        } else {
          throw new Error("Simulated retry failure");
        }
      });
    } catch {
      // Expected failures after retries
    }
  }
});

// Benchmark: Metrics Collection Performance
Deno.bench("Metrics - Collection", { group: "observability" }, () => {
  const metrics = new MetricsCollector();
  
  for (let i = 0; i < 1000; i++) {
    metrics.recordRequest("GET", "/test", 200, Math.random() * 100);
    
    if (i % 10 === 0) {
      metrics.recordCacheHit();
    } else if (i % 50 === 0) {
      metrics.recordCacheMiss();
    }
    
    if (i % 100 === 0) {
      metrics.recordError("test-error");
    }
  }
});

Deno.bench("Metrics - Export", { group: "observability" }, () => {
  const metrics = new MetricsCollector();
  
  // Generate some sample data
  for (let i = 0; i < 100; i++) {
    metrics.recordRequest("GET", "/test", 200, Math.random() * 100);
  }
  
  // Benchmark export
  for (let i = 0; i < 100; i++) {
    metrics.exportPrometheus();
  }
});

// Benchmark: Memory Pool Performance
Deno.bench("Memory Pool - Buffer Allocation", { group: "performance" }, () => {
  const buffers: ArrayBuffer[] = [];
  
  // Simulate high-frequency buffer allocation/deallocation
  for (let i = 0; i < 1000; i++) {
    const buffer = new ArrayBuffer(1024); // 1KB buffers
    buffers.push(buffer);
    
    if (buffers.length > 100) {
      buffers.shift(); // Remove oldest buffer
    }
  }
});

// Benchmark: JSON Processing Performance
Deno.bench("JSON - Parse/Stringify", { group: "serialization" }, () => {
  const testData = {
    original: { amount: 100.50, currency: "EUR" },
    converted: { amount: 110.55, currency: "USD" },
    exchangeRate: 1.1,
    timestamp: "2025-08-24T10:00:00Z",
    metadata: {
      source: "cache",
      processingTime: 15,
      requestId: "req_abc123",
    }
  };
  
  for (let i = 0; i < 1000; i++) {
    const serialized = JSON.stringify(testData);
    JSON.parse(serialized);
  }
});

// Benchmark: Concurrent Operations
Deno.bench("Concurrent - Mixed Workload", { group: "concurrency" }, async () => {
  const currencyConverter = new EurToUsdConverter({});
  const unitConverter = new MetricToImperialConverter({});
  const dateConverter = new EuToUsaDateConverter({});
  
  const tasks = [];
  
  // Create mixed workload
  for (let i = 0; i < 50; i++) {
    tasks.push(
      currencyConverter.convert({ amount: 100 }),
      unitConverter.convert({ value: 100, unit: "km" }),
      dateConverter.convert({ date: "24/08/2025" })
    );
  }
  
  await Promise.all(tasks);
});

console.log("🚀 Performance benchmarks completed");
console.log("Run with: deno bench tests/performance/benchmark.ts");
console.log("For detailed output: deno bench --json tests/performance/benchmark.ts");