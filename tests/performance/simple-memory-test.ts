// Simple Memory Usage Test for EU-USA Data Pipeline
// Lightweight memory monitoring without complex dependencies

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

async function testMemoryUsage() {
  console.log("🧠 Simple Memory Usage Test");
  console.log("============================");
  
  const initialMemory = getMemoryUsage();
  console.log(`Initial memory: ${formatBytes(initialMemory.heapUsed)}`);
  console.log(`Initial RSS: ${formatBytes(initialMemory.rss)}`);
  
  // Test 1: Array allocation and processing
  console.log("\n📊 Test 1: Large Array Processing");
  const arrays: number[][] = [];
  
  for (let i = 0; i < 100; i++) {
    // Create arrays of increasing size
    const array = new Array(1000 + i * 100).fill(0).map(() => Math.random());
    arrays.push(array);
    
    // Process the array
    const processed = array
      .filter(x => x > 0.5)
      .map(x => x * 2)
      .reduce((sum, x) => sum + x, 0);
      
    if (i % 20 === 0) {
      const currentMemory = getMemoryUsage();
      console.log(`  Iteration ${i}: Memory = ${formatBytes(currentMemory.heapUsed)}`);
    }
  }
  
  // Force garbage collection if available
  if (typeof globalThis.gc === 'function') {
    globalThis.gc();
    console.log("  🗑️  Forced garbage collection");
  }
  
  // Test 2: Object creation and manipulation
  console.log("\n📊 Test 2: Object Creation and Cloning");
  const objects: any[] = [];
  
  for (let i = 0; i < 1000; i++) {
    const obj = {
      id: `test-${i}`,
      data: {
        values: new Array(100).fill(0).map(() => ({
          timestamp: Date.now(),
          value: Math.random() * 1000,
          metadata: {
            processed: true,
            source: "test",
            tags: [`tag-${i % 10}`, `category-${i % 5}`]
          }
        }))
      }
    };
    
    // Clone object using JSON (common pattern)
    const cloned = JSON.parse(JSON.stringify(obj));
    objects.push(cloned);
    
    if (i % 200 === 0) {
      const currentMemory = getMemoryUsage();
      console.log(`  Created ${i} objects: Memory = ${formatBytes(currentMemory.heapUsed)}`);
    }
  }
  
  // Test 3: String operations and accumulation
  console.log("\n📊 Test 3: String Processing");
  let largeString = "";
  const strings: string[] = [];
  
  for (let i = 0; i < 10000; i++) {
    const str = `Processing item ${i} with data: ${JSON.stringify({
      id: i,
      timestamp: new Date().toISOString(),
      data: Math.random().toString(36).substring(7)
    })}`;
    
    strings.push(str);
    largeString += str + "\n";
    
    if (i % 2000 === 0) {
      const currentMemory = getMemoryUsage();
      console.log(`  String operations ${i}: Memory = ${formatBytes(currentMemory.heapUsed)}`);
    }
  }
  
  // Test 4: Cleanup and measure final memory
  console.log("\n📊 Test 4: Memory Cleanup");
  
  // Clear references
  arrays.length = 0;
  objects.length = 0;
  strings.length = 0;
  largeString = "";
  
  // Force garbage collection if available
  if (typeof globalThis.gc === 'function') {
    globalThis.gc();
    console.log("  🗑️  Forced garbage collection after cleanup");
  }
  
  // Wait a bit for cleanup
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const finalMemory = getMemoryUsage();
  console.log(`  Final memory: ${formatBytes(finalMemory.heapUsed)}`);
  console.log(`  Final RSS: ${formatBytes(finalMemory.rss)}`);
  
  // Analysis
  const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
  const growthPercentage = (memoryGrowth / initialMemory.heapUsed) * 100;
  
  console.log("\n📊 Memory Analysis:");
  console.log(`  Memory growth: ${formatBytes(memoryGrowth)} (${growthPercentage.toFixed(2)}%)`);
  console.log(`  RSS growth: ${formatBytes(finalMemory.rss - initialMemory.rss)}`);
  
  // Check for potential issues
  if (growthPercentage > 50) {
    console.log("  ⚠️  High memory growth detected! May indicate memory retention.");
  } else if (growthPercentage > 20) {
    console.log("  ⚠️  Moderate memory growth. Monitor in production.");
  } else {
    console.log("  ✅ Memory growth within acceptable limits.");
  }
  
  return {
    initial: initialMemory,
    final: finalMemory,
    growth: memoryGrowth,
    growthPercentage
  };
}

// Quick memory stress test
async function memoryStressTest() {
  console.log("\n🔥 Memory Stress Test (30 seconds)");
  console.log("==================================");
  
  const startTime = Date.now();
  const duration = 30 * 1000; // 30 seconds
  const snapshots: { time: number; memory: number }[] = [];
  
  const initialMemory = getMemoryUsage();
  snapshots.push({ time: 0, memory: initialMemory.heapUsed });
  
  let iteration = 0;
  while (Date.now() - startTime < duration) {
    // Create temporary data
    const tempData = new Array(1000).fill(0).map((_, i) => ({
      id: iteration * 1000 + i,
      data: Math.random().toString(36).substring(7),
      timestamp: Date.now(),
      values: new Array(10).fill(Math.random())
    }));
    
    // Process data
    const processed = tempData
      .filter(item => item.values.some(v => v > 0.5))
      .map(item => ({ ...item, processed: true }));
      
    // Clear references (simulate cleanup)
    tempData.length = 0;
    processed.length = 0;
    
    iteration++;
    
    // Sample memory every 5 seconds
    const elapsed = Date.now() - startTime;
    if (elapsed % 5000 < 50) { // Close to 5 second intervals
      const currentMemory = getMemoryUsage();
      snapshots.push({ time: elapsed, memory: currentMemory.heapUsed });
      
      const seconds = Math.floor(elapsed / 1000);
      console.log(`  ${seconds}s: Memory = ${formatBytes(currentMemory.heapUsed)} (${iteration} iterations)`);
    }
    
    // Small delay to prevent tight loop
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  
  if (typeof globalThis.gc === 'function') {
    globalThis.gc();
  }
  
  const finalMemory = getMemoryUsage();
  const totalGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
  const growthRate = totalGrowth / (duration / 1000); // bytes per second
  
  console.log(`\n  📊 Stress Test Results:`);
  console.log(`  Total iterations: ${iteration}`);
  console.log(`  Memory growth: ${formatBytes(totalGrowth)}`);
  console.log(`  Growth rate: ${formatBytes(growthRate)}/second`);
  
  if (growthRate > 1024 * 1024) { // More than 1MB/second
    console.log(`  ⚠️  High memory growth rate!`);
  } else if (growthRate > 1024) { // More than 1KB/second
    console.log(`  ⚠️  Moderate memory growth rate.`);
  } else {
    console.log(`  ✅ Memory growth rate within limits.`);
  }
  
  return { 
    iterations: iteration, 
    totalGrowth, 
    growthRate,
    snapshots 
  };
}

// Main execution
async function runMemoryTests() {
  try {
    const basicTest = await testMemoryUsage();
    const stressTest = await memoryStressTest();
    
    console.log("\n✅ Memory tests completed successfully");
    console.log("\n💡 Tips:");
    console.log("  - Run with --v8-flags=--expose-gc for more accurate results");
    console.log("  - Monitor RSS memory in production environments");
    console.log("  - Use external profiling tools for detailed analysis");
    
    return {
      basicTest,
      stressTest
    };
  } catch (error) {
    console.error("❌ Memory test failed:", error);
    throw error;
  }
}

// Run tests if this file is executed directly
if (import.meta.main) {
  await runMemoryTests();
}