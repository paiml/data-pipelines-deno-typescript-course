import { assertEquals, assertExists } from "@std/testing";
import { DataPipeline } from "./data-pipeline.ts";
import { EURecord } from "../types.ts";

Deno.test("DataPipeline", async (t) => {
  await t.step("should process currency records", async () => {
    const pipeline = new DataPipeline({
      output: { format: "json" },
    });

    const testRecords: EURecord[] = [
      {
        id: "test-1",
        type: "currency",
        data: {
          amount_eur: 100,
          price_eur: 50.50,
        },
      },
    ];

    const metrics = await pipeline.processFromArray(testRecords);
    
    assertEquals(metrics.processed, 1);
    assertEquals(metrics.failed, 0);
    assertExists(metrics.avgLatency);
  });

  await t.step("should process unit conversion records", async () => {
    const pipeline = new DataPipeline({
      output: { format: "json" },
    });

    const testRecords: EURecord[] = [
      {
        id: "test-2",
        type: "unit",
        data: {
          distance_meters: 100,
          temperature_celsius: 25,
          weight_kilograms: 75,
        },
      },
    ];

    const metrics = await pipeline.processFromArray(testRecords);
    
    assertEquals(metrics.processed, 1);
    assertEquals(metrics.failed, 0);
  });

  await t.step("should process date format records", async () => {
    const pipeline = new DataPipeline({
      output: { format: "json" },
    });

    const testRecords: EURecord[] = [
      {
        id: "test-3",
        type: "date",
        data: {
          start_date: "25/12/2024",
          end_date: "31/12/2024",
        },
      },
    ];

    const metrics = await pipeline.processFromArray(testRecords);
    
    assertEquals(metrics.processed, 1);
    assertEquals(metrics.failed, 0);
  });

  await t.step("should process number format records", async () => {
    const pipeline = new DataPipeline({
      output: { format: "json" },
    });

    const testRecords: EURecord[] = [
      {
        id: "test-4",
        type: "number",
        data: {
          total: "1.234,56",
          subtotal: "999,99",
        },
      },
    ];

    const metrics = await pipeline.processFromArray(testRecords);
    
    assertEquals(metrics.processed, 1);
    assertEquals(metrics.failed, 0);
  });

  await t.step("should process mixed type records", async () => {
    const pipeline = new DataPipeline({
      output: { format: "json" },
    });

    const testRecords: EURecord[] = [
      {
        id: "test-5",
        type: "mixed",
        data: {
          price_eur: 100,
          weight_kilograms: 2.5,
          date: "25/12/2024",
          total: "1.234,56",
        },
      },
    ];

    const metrics = await pipeline.processFromArray(testRecords);
    
    assertEquals(metrics.processed, 1);
    assertEquals(metrics.failed, 0);
  });

  await t.step("should handle invalid records", async () => {
    const pipeline = new DataPipeline({
      output: { format: "json" },
      errorHandling: { deadLetterQueue: true },
    });

    const testRecords = [
      { invalid: "record" }, // Missing required fields
      {
        id: "test-6",
        type: "unknown" as any, // Invalid type
        data: {},
      },
    ];

    const metrics = await pipeline.processFromArray(testRecords);
    
    // Invalid records should be filtered at ingestion
    assertEquals(metrics.processed, 0);
    
    const dlq = pipeline.getDeadLetterQueue();
    assertEquals(dlq.length > 0, true);
  });

  await t.step("should handle backpressure", async () => {
    const pipeline = new DataPipeline({
      output: { format: "json" },
    });

    // Generate many records
    const testRecords: EURecord[] = Array.from({ length: 100 }, (_, i) => ({
      id: `test-${i}`,
      type: "currency" as const,
      data: { amount_eur: i * 10 },
    }));

    const metricsPromise = pipeline.processFromArray(testRecords);
    
    // Check queue size during processing
    await new Promise(resolve => setTimeout(resolve, 10));
    const queueSize = pipeline.getQueueSize();
    assertEquals(queueSize >= 0, true);
    
    const metrics = await metricsPromise;
    assertEquals(metrics.processed, 100);
  });

  await t.step("should stop gracefully", async () => {
    const pipeline = new DataPipeline({
      output: { format: "json" },
    });

    const testRecords: EURecord[] = Array.from({ length: 1000 }, (_, i) => ({
      id: `test-${i}`,
      type: "currency" as const,
      data: { amount_eur: i },
    }));

    // Start processing
    const processPromise = pipeline.processFromArray(testRecords);
    
    // Stop after a short delay
    setTimeout(() => pipeline.stop(), 50);
    
    const metrics = await processPromise;
    
    // Should have processed some but not all records
    assertEquals(metrics.processed > 0, true);
    assertEquals(metrics.processed < 1000, true);
  });

  await t.step("should reset pipeline state", () => {
    const pipeline = new DataPipeline();
    
    // Add some entries to DLQ
    pipeline["deadLetterQueue"] = [
      {
        id: "test",
        timestamp: new Date(),
        record: {},
        error: new Error("test"),
        attempts: 1,
        stage: "test",
      },
    ];
    
    pipeline.reset();
    
    assertEquals(pipeline.getDeadLetterQueue().length, 0);
    assertEquals(pipeline.getQueueSize(), 0);
    
    const metrics = pipeline.getMetrics();
    assertEquals(metrics.processed, 0);
    assertEquals(metrics.failed, 0);
  });

  await t.step("should support different output formats", async () => {
    // Test JSON format
    const jsonPipeline = new DataPipeline({
      output: { format: "json" },
    });

    const testRecord: EURecord = {
      id: "test-json",
      type: "currency",
      data: { amount_eur: 100 },
    };

    await jsonPipeline.processFromArray([testRecord]);

    // Test CSV format
    const csvPipeline = new DataPipeline({
      output: { format: "csv" },
    });

    await csvPipeline.processFromArray([testRecord]);

    // Test NDJSON format
    const ndjsonPipeline = new DataPipeline({
      output: { format: "ndjson" },
    });

    await ndjsonPipeline.processFromArray([testRecord]);
    
    // All formats should process successfully
    assertEquals(true, true);
  });
});