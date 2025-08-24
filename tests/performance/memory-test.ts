// Memory Usage and Leak Testing for EU-USA Data Pipeline
// This suite monitors memory consumption and detects potential leaks

import { CurrencyConverter } from "../../src/converters/currency/currency-converter.ts";
import { CacheManager } from "../../src/shared/performance/cache-manager.ts";
import { WorkerPool } from "../../src/shared/performance/worker-pool.ts";
import { PerformanceMetrics } from "../../src/shared/performance/performance-metrics.ts";

interface MemorySnapshot {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
}

function getMemoryUsage(): MemorySnapshot {
  return Deno.memoryUsage();
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

async function runMemoryTest(
  testName: string,
  testFn: () => Promise<void>,
  iterations: number = 100
) {
  console.log(`\n🧪 ${testName}`);
  console.log("=".repeat(50));
  
  const initialMemory = getMemoryUsage();
  console.log(`Initial memory: ${formatBytes(initialMemory.heapUsed)}`);
  
  const snapshots: MemorySnapshot[] = [initialMemory];
  
  for (let i = 0; i < iterations; i++) {
    await testFn();
    
    if (i % 10 === 9) { // Sample every 10 iterations
      // Force garbage collection if available
      if (typeof globalThis.gc === 'function') {
        globalThis.gc();
      }
      
      const snapshot = getMemoryUsage();
      snapshots.push(snapshot);
      
      const progress = ((i + 1) / iterations * 100).toFixed(1);
      console.log(`Progress: ${progress}% - Memory: ${formatBytes(snapshot.heapUsed)}`);
    }
  }
  
  const finalMemory = getMemoryUsage();
  snapshots.push(finalMemory);
  
  // Analysis
  const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
  const maxMemory = Math.max(...snapshots.map(s => s.heapUsed));
  const avgMemory = snapshots.reduce((sum, s) => sum + s.heapUsed, 0) / snapshots.length;
  
  console.log(`\n📊 Results:`);
  console.log(`Final memory: ${formatBytes(finalMemory.heapUsed)}`);
  console.log(`Memory growth: ${formatBytes(memoryGrowth)} (${memoryGrowth > 0 ? '+' : ''}${(memoryGrowth / initialMemory.heapUsed * 100).toFixed(2)}%)`);
  console.log(`Peak memory: ${formatBytes(maxMemory)}`);
  console.log(`Average memory: ${formatBytes(avgMemory)}`);
  
  // Check for potential memory leaks
  const leakThreshold = initialMemory.heapUsed * 1.5; // 50% growth threshold
  if (finalMemory.heapUsed > leakThreshold) {
    console.log(`⚠️  Potential memory leak detected! Growth: ${formatBytes(memoryGrowth)}`);
  } else {
    console.log(`✅ Memory usage within acceptable limits`);
  }
  
  return {
    initial: initialMemory,
    final: finalMemory,
    growth: memoryGrowth,
    max: maxMemory,
    average: avgMemory,
    snapshots
  };
}

// Test 1: Currency Converter Memory Usage
async function testCurrencyConverterMemory() {
  await runMemoryTest("Currency Converter Memory Test", async () => {
    const converter = new CurrencyConverter();
    
    // Process multiple conversions
    const conversions = Array.from({ length: 10 }, (_, i) => ({
      amount: Math.random() * 1000,
      from: i % 2 === 0 ? "EUR" : "USD",
      to: i % 2 === 0 ? "USD" : "EUR"
    }));
    
    await Promise.all(conversions.map(c => converter.convert(c)));
  }, 200);
}

// Test 2: Cache Manager Memory Usage
async function testCacheMemory() {
  await runMemoryTest("Cache Manager Memory Test", async () => {
    const cache = new CacheManager();
    
    // Add items to cache
    for (let i = 0; i < 50; i++) {
      const key = `test-key-${i}`;
      const value = {
        data: new Array(100).fill(`item-${i}`), // ~100 string items
        timestamp: Date.now(),
        metadata: { processed: true, id: i }
      };
      cache.set(key, value, 300);
    }
    
    // Access some cached items
    for (let i = 0; i < 25; i++) {
      cache.get(`test-key-${i}`);
    }
    
    // Clear some items to test cleanup
    if (Math.random() > 0.8) {
      cache.clear();
    }
  }, 150);
}

// Test 3: Worker Pool Memory Usage
async function testWorkerPoolMemory() {
  await runMemoryTest("Worker Pool Memory Test", async () => {
    const pool = new WorkerPool(2);
    
    const tasks = Array.from({ length: 10 }, (_, i) => 
      async () => {
        // Simulate memory-intensive work
        const largeArray = new Array(1000).fill(0).map(() => Math.random());
        
        // Some computation to prevent optimization
        return largeArray.reduce((sum, val) => sum + val, 0);
      }
    );
    
    await Promise.all(tasks.map(task => pool.execute(task)));
    pool.terminate();
  }, 50);
}

// Test 4: Metrics Collection Memory Usage
async function testMetricsMemory() {
  await runMemoryTest("Performance Metrics Memory Test", async () => {
    const metrics = new PerformanceMetrics();
    
    // Generate metric data
    for (let i = 0; i < 100; i++) {
      const requestId = `req-${i}`;
      metrics.recordRequestStart(requestId);
      
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 1));
      
      metrics.recordRequestEnd(requestId, 200, Math.random() * 100);
      
      if (i % 5 === 0) {
        metrics.recordCacheHit();
      } else if (i % 7 === 0) {
        metrics.recordCacheMiss();
      }
      
      if (i % 20 === 0) {
        metrics.recordError("test-error", "Memory test error");
      }
    }
    
    // Export metrics (creates string data)
    metrics.exportPrometheusMetrics();
  }, 100);
}

// Test 5: Large Data Processing Memory Usage
async function testLargeDataProcessing() {
  await runMemoryTest("Large Data Processing Memory Test", async () => {
    const converter = new CurrencyConverter();
    
    // Create large batch of conversions
    const largeBatch = Array.from({ length: 100 }, (_, i) => ({
      amount: Math.random() * 10000,
      from: "EUR",
      to: "USD",
      metadata: {
        requestId: `bulk-${i}`,
        timestamp: Date.now(),
        source: "memory-test",
        additionalData: new Array(50).fill(`data-${i}`)
      }
    }));
    
    // Process batch
    const results = await Promise.all(
      largeBatch.map(item => converter.convert(item))
    );
    
    // Ensure results aren't optimized away
    const totalAmount = results
      .filter(r => r.success)
      .map(r => r.success ? r.data.converted.amount : 0)
      .reduce((sum, amount) => sum + amount, 0);
    
    if (totalAmount < 0) {
      throw new Error("Unexpected result"); // Prevent optimization
    }
  }, 50);
}

// Test 6: Long-running Process Memory Usage
async function testLongRunningProcess() {
  console.log(`\n🧪 Long-running Process Memory Test`);
  console.log("=".repeat(50));
  console.log("This test runs for 2 minutes to detect memory leaks over time...");
  
  const startTime = Date.now();
  const duration = 2 * 60 * 1000; // 2 minutes
  const snapshots: { time: number; memory: MemorySnapshot }[] = [];
  
  const initialMemory = getMemoryUsage();
  snapshots.push({ time: 0, memory: initialMemory });
  
  const converter = new CurrencyConverter();
  const cache = new CacheManager();
  const metrics = new PerformanceMetrics();
  
  while (Date.now() - startTime < duration) {
    // Simulate regular application activity
    await converter.convert({ amount: Math.random() * 1000, from: "EUR", to: "USD" });
    
    cache.set(`key-${Date.now()}`, { data: Math.random() }, 300);
    
    if (Math.random() > 0.7) {
      cache.get(`key-${Date.now() - 1000}`);
    }
    
    metrics.recordRequestStart("long-running-test");
    metrics.recordRequestEnd("long-running-test", 200, Math.random() * 50);
    
    // Sample memory every 10 seconds
    const elapsed = Date.now() - startTime;
    if (elapsed % 10000 < 50) { // Close to 10 second intervals
      if (typeof globalThis.gc === 'function') {
        globalThis.gc();
      }
      
      const currentMemory = getMemoryUsage();
      snapshots.push({ time: elapsed, memory: currentMemory });
      
      const minutes = Math.floor(elapsed / 60000);
      const seconds = Math.floor((elapsed % 60000) / 1000);
      console.log(`${minutes}:${seconds.toString().padStart(2, '0')} - Memory: ${formatBytes(currentMemory.heapUsed)}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 50)); // 50ms intervals
  }
  
  const finalMemory = getMemoryUsage();
  const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
  const growthRate = memoryGrowth / (duration / 1000); // bytes per second
  
  console.log(`\n📊 Long-running Process Results:`);
  console.log(`Initial memory: ${formatBytes(initialMemory.heapUsed)}`);
  console.log(`Final memory: ${formatBytes(finalMemory.heapUsed)}`);
  console.log(`Total growth: ${formatBytes(memoryGrowth)}`);
  console.log(`Growth rate: ${formatBytes(growthRate)}/second`);
  
  if (growthRate > 1024) { // More than 1KB/second growth
    console.log(`⚠️  High memory growth rate detected!`);
  } else {
    console.log(`✅ Memory growth rate within acceptable limits`);
  }
}

// Main execution
async function runAllMemoryTests() {
  console.log("🧠 Memory Usage and Leak Testing Suite");
  console.log("=====================================");
  
  try {
    await testCurrencyConverterMemory();
    await testCacheMemory();
    await testWorkerPoolMemory();
    await testMetricsMemory();
    await testLargeDataProcessing();
    await testLongRunningProcess();
    
    console.log(`\n✅ All memory tests completed successfully`);
    console.log(`\n💡 Tips for running memory tests:`);
    console.log(`   - Run with --v8-flags=--expose-gc to enable garbage collection`);
    console.log(`   - Use external memory profiling tools for detailed analysis`);
    console.log(`   - Monitor RSS memory in production environments`);
    
  } catch (error) {
    console.error("❌ Memory test failed:", error);
    Deno.exit(1);
  }
}

// Run tests if this file is executed directly
if (import.meta.main) {
  await runAllMemoryTests();
}