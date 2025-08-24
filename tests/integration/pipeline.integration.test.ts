import { assertEquals, assertExists } from "@std/assert";
import { 
  PipelineOrchestrator, 
  createDefaultPipeline,
  EUDataRecord,
  PipelineConfig,
} from "../../src/pipeline/pipeline-orchestrator.ts";
import { RetryPolicy } from "../../src/shared/resilience/retry-policy.ts";

// Test data factory
function createTestRecord(id: string): EUDataRecord {
  return {
    id,
    currency: { amount: 100 },
    measurements: [
      { value: 100, unit: "km" },
      { value: 50, unit: "kg" },
      { value: 25, unit: "celsius" },
    ],
    dates: ["24/08/2025", "15/12/2024"],
    numbers: ["1.234,56", "999.999,99"],
    address: {
      street: "Hauptstraße",
      houseNumber: "123A",
      postalCode: "10115",
      city: "Berlin",
      country: "Germany",
    },
    phone: "+49 30 12345678",
    vat: {
      amount: 100,
      rate: 0.19,
      country: "DE",
    },
    privacy: {
      requestType: "access",
      dataCategories: ["personal", "usage", "location"],
      purposes: ["marketing", "analytics", "personalization"],
    },
  };
}

Deno.test("Pipeline Integration - Single Record Processing", async () => {
  const pipeline = createDefaultPipeline();
  const record = createTestRecord("test-001");
  
  const result = await pipeline.processRecord(record);
  
  assertEquals(result.success, true);
  if (result.success) {
    // Verify all conversions
    assertExists(result.data.currency);
    assertEquals(result.data.currency?.currency, "USD");
    
    assertExists(result.data.measurements);
    assertEquals(result.data.measurements?.length > 0, true);
    
    assertExists(result.data.dates);
    assertEquals(result.data.dates?.length, 2);
    
    assertExists(result.data.numbers);
    assertEquals(result.data.numbers?.length, 2);
    
    assertExists(result.data.address);
    assertEquals(result.data.address?.city, "Berlin");
    
    assertExists(result.data.phone);
    
    assertExists(result.data.salesTax);
    assertEquals(result.data.salesTax?.state, "NY");
    
    assertExists(result.data.privacy);
    assertEquals(result.data.privacy?.requestType, "access");
  }
  
  await pipeline.cleanup();
});

Deno.test("Pipeline Integration - Batch Processing", async () => {
  const pipeline = createDefaultPipeline();
  const records = Array.from({ length: 10 }, (_, i) => 
    createTestRecord(`batch-${i.toString().padStart(3, "0")}`)
  );
  
  const result = await pipeline.processBatch(records);
  
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data.length, 10);
    
    // Verify each record
    for (const converted of result.data) {
      assertExists(converted.id);
      assertExists(converted.currency);
      assertExists(converted.measurements);
    }
  }
  
  await pipeline.cleanup();
});

Deno.test("Pipeline Integration - Partial Record Processing", async () => {
  const pipeline = createDefaultPipeline();
  const partialRecord: EUDataRecord = {
    id: "partial-001",
    currency: { amount: 50 },
    dates: ["01/01/2025"],
    // Missing other fields
  };
  
  const result = await pipeline.processRecord(partialRecord);
  
  assertEquals(result.success, true);
  if (result.success) {
    // Should process available fields
    assertExists(result.data.currency);
    assertExists(result.data.dates);
    
    // Should not have missing fields
    assertEquals(result.data.measurements, undefined);
    assertEquals(result.data.address, undefined);
  }
  
  await pipeline.cleanup();
});

Deno.test("Pipeline Integration - Error Handling", async () => {
  const config: PipelineConfig = {
    name: "test-pipeline-with-errors",
    stages: [
      {
        name: "failing-stage",
        converter: {
          convert: async () => {
            throw new Error("Simulated conversion error");
          },
          getMetadata: () => ({
            name: "failing-converter",
            version: "1.0.0",
            description: "Test converter that always fails",
          }),
        },
        required: true,
      },
    ],
    enableDeadLetterQueue: true,
  };
  
  const pipeline = new PipelineOrchestrator(config);
  const record = createTestRecord("error-001");
  
  const result = await pipeline.processRecord(record);
  
  assertEquals(result.success, false);
  assertEquals(result.error?.includes("Simulated conversion error"), true);
  
  // Check dead letter queue
  const metrics = pipeline.getMetrics();
  assertEquals(metrics.deadLetterQueue?.size > 0, true);
  
  await pipeline.cleanup();
});

Deno.test("Pipeline Integration - Retry Mechanism", async () => {
  let attempts = 0;
  
  const config: PipelineConfig = {
    name: "test-pipeline-with-retries",
    stages: [
      {
        name: "retry-stage",
        converter: {
          convert: async () => {
            attempts++;
            if (attempts < 3) {
              throw new Error("Temporary failure");
            }
            return { success: true, data: { converted: true } };
          },
          getMetadata: () => ({
            name: "retry-converter",
            version: "1.0.0",
            description: "Test converter with retries",
          }),
        },
        required: false,
        retryPolicy: new RetryPolicy({
          strategy: "exponential",
          maxAttempts: 3,
          initialDelay: 10,
        }),
      },
    ],
  };
  
  const pipeline = new PipelineOrchestrator(config);
  const record = createTestRecord("retry-001");
  
  const result = await pipeline.processRecord(record);
  
  assertEquals(result.success, true);
  assertEquals(attempts, 3); // Should retry until success
  
  await pipeline.cleanup();
});

Deno.test("Pipeline Integration - Circuit Breaker", async () => {
  const config: PipelineConfig = {
    name: "test-pipeline-with-circuit-breaker",
    stages: [
      {
        name: "circuit-breaker-stage",
        converter: {
          convert: async () => {
            throw new Error("Service unavailable");
          },
          getMetadata: () => ({
            name: "circuit-breaker-converter",
            version: "1.0.0",
            description: "Test converter with circuit breaker",
          }),
        },
        required: false,
      },
    ],
    enableCircuitBreaker: true,
  };
  
  const pipeline = new PipelineOrchestrator(config);
  
  // Trigger multiple failures to open circuit breaker
  for (let i = 0; i < 6; i++) {
    const record = createTestRecord(`cb-${i}`);
    await pipeline.processRecord(record);
  }
  
  // Check circuit breaker state
  const metrics = pipeline.getMetrics();
  const cbState = metrics.circuitBreakers?.[0];
  assertEquals(cbState?.state === "OPEN" || cbState?.state === "HALF_OPEN", true);
  
  await pipeline.cleanup();
});

Deno.test("Pipeline Integration - Caching", async () => {
  const config: PipelineConfig = {
    name: "test-pipeline-with-cache",
    stages: [
      {
        name: "cached-stage",
        converter: {
          convert: async (input: any) => ({
            success: true,
            data: { ...input, timestamp: Date.now() },
          }),
          getMetadata: () => ({
            name: "cached-converter",
            version: "1.0.0",
            description: "Test converter with caching",
          }),
        },
        required: false,
      },
    ],
    enableCache: true,
  };
  
  const pipeline = new PipelineOrchestrator(config);
  const record = createTestRecord("cache-001");
  
  // First call - should execute converter
  const result1 = await pipeline.processRecord(record);
  assertEquals(result1.success, true);
  
  // Second call - should use cache
  const result2 = await pipeline.processRecord(record);
  assertEquals(result2.success, true);
  
  // Check cache metrics
  const metrics = pipeline.getMetrics();
  assertEquals(metrics.cache?.stats.hits > 0, true);
  
  await pipeline.cleanup();
});

Deno.test("Pipeline Integration - Parallel Processing", async () => {
  const config: PipelineConfig = {
    name: "test-pipeline-parallel",
    stages: [
      {
        name: "parallel-stage",
        converter: {
          convert: async (input: any) => {
            // Simulate processing time
            await new Promise(resolve => setTimeout(resolve, 10));
            return { success: true, data: { processed: true } };
          },
          getMetadata: () => ({
            name: "parallel-converter",
            version: "1.0.0",
            description: "Test converter for parallel processing",
          }),
        },
        required: false,
        parallel: true,
      },
    ],
    parallelism: 4,
  };
  
  const pipeline = new PipelineOrchestrator(config);
  const records = Array.from({ length: 20 }, (_, i) => 
    createTestRecord(`parallel-${i}`)
  );
  
  const startTime = Date.now();
  const result = await pipeline.processBatch(records);
  const duration = Date.now() - startTime;
  
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data.length, 20);
    
    // Should be faster than sequential (20 * 10ms = 200ms)
    assertEquals(duration < 150, true); // Allow some overhead
  }
  
  await pipeline.cleanup();
});

Deno.test("Pipeline Integration - Dead Letter Queue Processing", async () => {
  const config: PipelineConfig = {
    name: "test-pipeline-dlq",
    stages: [
      {
        name: "dlq-stage",
        converter: {
          convert: async () => {
            throw new Error("Processing failed");
          },
          getMetadata: () => ({
            name: "dlq-converter",
            version: "1.0.0",
            description: "Test converter for DLQ",
          }),
        },
        required: true,
      },
    ],
    enableDeadLetterQueue: true,
  };
  
  const pipeline = new PipelineOrchestrator(config);
  const record = createTestRecord("dlq-001");
  
  // Process record - should fail and go to DLQ
  const result = await pipeline.processRecord(record);
  assertEquals(result.success, false);
  
  // Check DLQ has the message
  let metrics = pipeline.getMetrics();
  assertEquals(metrics.deadLetterQueue?.size, 1);
  
  // Process DLQ (will still fail but increment retry count)
  await pipeline.processDeadLetterQueue();
  
  // Check retry was attempted
  metrics = pipeline.getMetrics();
  const oldestMessage = metrics.deadLetterQueue?.oldest;
  assertExists(oldestMessage);
  assertEquals(oldestMessage.retries > 0, true);
  
  await pipeline.cleanup();
});

Deno.test("Pipeline Integration - Metrics Collection", async () => {
  const pipeline = createDefaultPipeline();
  const record = createTestRecord("metrics-001");
  
  // Process record
  await pipeline.processRecord(record);
  
  // Get metrics
  const metrics = pipeline.getMetrics();
  
  // Verify metrics structure
  assertExists(metrics.cache);
  assertExists(metrics.metrics);
  assertExists(metrics.circuitBreakers);
  assertExists(metrics.deadLetterQueue);
  
  // Verify metrics contain data
  assertEquals(typeof metrics.cache.size, "number");
  assertEquals(metrics.cache.stats.requests > 0, true);
  
  await pipeline.cleanup();
});

Deno.test("Pipeline Integration - End-to-End Complex Record", async () => {
  const pipeline = createDefaultPipeline();
  
  const complexRecord: EUDataRecord = {
    id: "complex-001",
    currency: { amount: 1234.56 },
    measurements: [
      { value: 150, unit: "km" },
      { value: 75.5, unit: "kg" },
      { value: 30, unit: "celsius" },
      { value: 2.5, unit: "meters" },
      { value: 100, unit: "liters" },
    ],
    dates: ["01/01/2025", "31/12/2025", "15/06/2024"],
    numbers: ["1.234.567,89", "999,99", "0,01"],
    address: {
      street: "Friedrichstraße",
      houseNumber: "200",
      postalCode: "10117",
      city: "Berlin",
      country: "Germany",
    },
    phone: "+49 170 9876543",
    vat: {
      amount: 5000,
      rate: 0.19,
      country: "DE",
    },
    privacy: {
      requestType: "deletion",
      dataCategories: ["personal", "financial", "behavioral", "location"],
      purposes: ["marketing", "analytics", "personalization", "research"],
    },
  };
  
  const result = await pipeline.processRecord(complexRecord);
  
  assertEquals(result.success, true);
  if (result.success) {
    // Verify comprehensive conversion
    assertEquals(result.data.id, "complex-001");
    
    // Currency conversion
    assertExists(result.data.currency);
    assertEquals(typeof result.data.currency?.amount, "number");
    
    // Multiple measurements
    assertExists(result.data.measurements);
    assertEquals(result.data.measurements?.length > 0, true);
    
    // Multiple dates
    assertExists(result.data.dates);
    assertEquals(result.data.dates?.length, 3);
    
    // Multiple numbers
    assertExists(result.data.numbers);
    assertEquals(result.data.numbers?.length, 3);
    
    // Address conversion
    assertExists(result.data.address);
    assertEquals(result.data.address?.zipCode, "10117");
    
    // Phone formatting
    assertExists(result.data.phone);
    
    // Tax calculation
    assertExists(result.data.salesTax);
    assertEquals(result.data.salesTax?.subtotal, 5000);
    
    // Privacy mapping
    assertExists(result.data.privacy);
    assertEquals(result.data.privacy?.requestType, "deletion");
    assertEquals(Array.isArray(result.data.privacy?.rights), true);
  }
  
  await pipeline.cleanup();
});

console.log("✅ Pipeline integration tests completed");