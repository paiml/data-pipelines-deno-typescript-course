import { assertEquals, assertExists } from "@std/assert";
import { DeadLetterQueue, DLQManager } from "../../../src/shared/resilience/dead-letter-queue.ts";
import { Result } from "../../../src/shared/types/result.ts";

interface TestPayload {
  message: string;
  value: number;
}

Deno.test("DeadLetterQueue", async (t) => {
  await t.step("should add and retrieve entries", async () => {
    const dlq = new DeadLetterQueue<TestPayload>("test-dlq");
    
    const entry = {
      payload: { message: "test", value: 42 },
      error: new Error("Processing failed"),
      originalQueue: "main-queue",
      attemptCount: 1,
      maxAttempts: 3,
    };

    const addResult = await dlq.add(entry);
    assertEquals(Result.isOk(addResult), true);
    
    if (Result.isOk(addResult)) {
      const getResult = await dlq.get(addResult.value);
      assertEquals(Result.isOk(getResult), true);
      
      if (Result.isOk(getResult) && getResult.value) {
        assertEquals(getResult.value.payload.message, "test");
        assertEquals(getResult.value.payload.value, 42);
        assertEquals(getResult.value.attemptCount, 1);
        assertEquals(getResult.value.maxAttempts, 3);
        assertEquals(getResult.value.originalQueue, "main-queue");
      }
    }
  });

  await t.step("should identify retryable entries", async () => {
    const dlq = new DeadLetterQueue<TestPayload>("retryable-test");
    
    // Add retryable entry
    await dlq.add({
      payload: { message: "retryable", value: 1 },
      error: new Error("Temporary failure"),
      originalQueue: "test-queue",
      attemptCount: 1,
      maxAttempts: 3,
    });

    // Add non-retryable entry (max attempts reached)
    await dlq.add({
      payload: { message: "exhausted", value: 2 },
      error: new Error("Max attempts reached"),
      originalQueue: "test-queue",
      attemptCount: 3,
      maxAttempts: 3,
    });

    // Add entry with future retry time
    await dlq.add({
      payload: { message: "waiting", value: 3 },
      error: new Error("Waiting for retry"),
      originalQueue: "test-queue",
      attemptCount: 1,
      maxAttempts: 3,
      nextRetryTime: Date.now() + 60_000, // 1 minute from now
    });

    const retryableResult = await dlq.getRetryableEntries();
    assertEquals(Result.isOk(retryableResult), true);
    
    if (Result.isOk(retryableResult)) {
      assertEquals(retryableResult.value.length, 1);
      assertEquals(retryableResult.value[0].payload.message, "retryable");
    }
  });

  await t.step("should process entries successfully", async () => {
    const dlq = new DeadLetterQueue<TestPayload>("process-test", {
      batchSize: 2,
    });
    
    // Add processable entries
    await dlq.add({
      payload: { message: "success", value: 1 },
      error: new Error("Will succeed"),
      originalQueue: "process-queue",
      attemptCount: 1,
      maxAttempts: 3,
    });

    await dlq.add({
      payload: { message: "failure", value: 2 },
      error: new Error("Will fail"),
      originalQueue: "process-queue",
      attemptCount: 1,
      maxAttempts: 3,
    });

    const processResult = await dlq.process(async (entry) => {
      if (entry.payload.message === "success") {
        return Result.ok(undefined);
      } else {
        return Result.err(new Error("Processing failed again"));
      }
    });

    assertEquals(Result.isOk(processResult), true);
    
    if (Result.isOk(processResult)) {
      const result = processResult.value;
      assertEquals(result.processed, 2);
      assertEquals(result.succeeded, 1);
      assertEquals(result.failed, 1);
      assertEquals(result.errors.length, 1);
    }
  });

  await t.step("should handle entry removal", async () => {
    const dlq = new DeadLetterQueue<TestPayload>("remove-test");
    
    const addResult = await dlq.add({
      payload: { message: "removable", value: 99 },
      error: new Error("To be removed"),
      originalQueue: "remove-queue",
      attemptCount: 1,
      maxAttempts: 3,
    });

    assertEquals(Result.isOk(addResult), true);
    
    if (Result.isOk(addResult)) {
      const removeResult = await dlq.remove(addResult.value);
      assertEquals(Result.isOk(removeResult), true);
      assertEquals(Result.isOk(removeResult) && removeResult.value, true);

      const getResult = await dlq.get(addResult.value);
      assertEquals(Result.isOk(getResult), true);
      assertEquals(Result.isOk(getResult) && getResult.value, null);
    }
  });

  await t.step("should provide statistics", async () => {
    const dlq = new DeadLetterQueue<TestPayload>("stats-test", {
      ttl: 1000, // 1 second for testing expiration
    });
    
    // Add various entries
    await dlq.add({
      payload: { message: "queue1", value: 1 },
      error: new Error("Error 1"),
      originalQueue: "queue-1",
      attemptCount: 1,
      maxAttempts: 3,
    });

    await dlq.add({
      payload: { message: "queue2", value: 2 },
      error: new Error("Error 2"),
      originalQueue: "queue-2",
      attemptCount: 1,
      maxAttempts: 3,
    });

    const statsResult = await dlq.getStats();
    assertEquals(Result.isOk(statsResult), true);
    
    if (Result.isOk(statsResult)) {
      const stats = statsResult.value;
      assertEquals(stats.totalEntries, 2);
      assertEquals(stats.retryableEntries, 2);
      assertExists(stats.entriesByQueue["queue-1"]);
      assertExists(stats.entriesByQueue["queue-2"]);
      assertEquals(stats.entriesByQueue["queue-1"], 1);
      assertEquals(stats.entriesByQueue["queue-2"], 1);
    }
  });

  await t.step("should clear expired entries", async () => {
    const dlq = new DeadLetterQueue<TestPayload>("expiry-test", {
      ttl: 50, // 50ms for quick expiration
    });
    
    await dlq.add({
      payload: { message: "expires", value: 1 },
      error: new Error("Will expire"),
      originalQueue: "expiry-queue",
      attemptCount: 1,
      maxAttempts: 3,
    });

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 100));

    const clearedResult = await dlq.clearExpired();
    assertEquals(Result.isOk(clearedResult), true);
    
    if (Result.isOk(clearedResult)) {
      assertEquals(clearedResult.value, 1);
    }

    const statsResult = await dlq.getStats();
    assertEquals(Result.isOk(statsResult), true);
    
    if (Result.isOk(statsResult)) {
      assertEquals(statsResult.value.totalEntries, 0);
    }
  });

  await t.step("should list entries with filters", async () => {
    const dlq = new DeadLetterQueue<TestPayload>("filter-test");
    
    await dlq.add({
      payload: { message: "filter-test-1", value: 1 },
      error: new Error("Error 1"),
      originalQueue: "queue-a",
      attemptCount: 1,
      maxAttempts: 3,
    });

    await dlq.add({
      payload: { message: "filter-test-2", value: 2 },
      error: new Error("Error 2"),
      originalQueue: "queue-b",
      attemptCount: 3, // Max attempts reached
      maxAttempts: 3,
    });

    // Filter by queue
    const queueFilterResult = await dlq.listEntries({ queue: "queue-a" });
    assertEquals(Result.isOk(queueFilterResult), true);
    
    if (Result.isOk(queueFilterResult)) {
      assertEquals(queueFilterResult.value.length, 1);
      assertEquals(queueFilterResult.value[0].originalQueue, "queue-a");
    }

    // Filter by retryable
    const retryableFilterResult = await dlq.listEntries({ retryable: true });
    assertEquals(Result.isOk(retryableFilterResult), true);
    
    if (Result.isOk(retryableFilterResult)) {
      assertEquals(retryableFilterResult.value.length, 1);
      assertEquals(retryableFilterResult.value[0].attemptCount < retryableFilterResult.value[0].maxAttempts, true);
    }
  });

  await t.step("should clear all entries", async () => {
    const dlq = new DeadLetterQueue<TestPayload>("clear-test");
    
    await dlq.add({
      payload: { message: "clear-1", value: 1 },
      error: new Error("Error 1"),
      originalQueue: "clear-queue",
      attemptCount: 1,
      maxAttempts: 3,
    });

    await dlq.add({
      payload: { message: "clear-2", value: 2 },
      error: new Error("Error 2"),
      originalQueue: "clear-queue",
      attemptCount: 1,
      maxAttempts: 3,
    });

    const clearResult = await dlq.clear();
    assertEquals(Result.isOk(clearResult), true);
    
    if (Result.isOk(clearResult)) {
      assertEquals(clearResult.value, 2);
    }

    const statsResult = await dlq.getStats();
    assertEquals(Result.isOk(statsResult), true);
    
    if (Result.isOk(statsResult)) {
      assertEquals(statsResult.value.totalEntries, 0);
    }
  });

  await t.step("should handle auto-processing configuration", async () => {
    const dlq = new DeadLetterQueue<TestPayload>("auto-test", {
      autoProcess: true,
      processInterval: 100, // 100ms for testing
    });
    
    assertEquals(dlq.getName(), "auto-test");
    
    // Stop auto-processing for clean shutdown
    dlq.stopAutoProcessing();
    
    const closeResult = await dlq.close();
    assertEquals(Result.isOk(closeResult), true);
  });
});

Deno.test("DLQManager", async (t) => {
  await t.step("should create and manage multiple DLQs", async () => {
    const manager = new DLQManager();
    
    const dlq1 = manager.getOrCreateDLQ<TestPayload>("dlq-1");
    const dlq2 = manager.getOrCreateDLQ<TestPayload>("dlq-2");
    
    assertEquals(dlq1.getName(), "dlq-1");
    assertEquals(dlq2.getName(), "dlq-2");
    
    const names = manager.getQueueNames();
    assertEquals(names.length, 2);
    assertEquals(names.includes("dlq-1"), true);
    assertEquals(names.includes("dlq-2"), true);
  });

  await t.step("should return existing DLQ when requested again", async () => {
    const manager = new DLQManager();
    
    const dlq1 = manager.getOrCreateDLQ<TestPayload>("same-dlq");
    const dlq2 = manager.getOrCreateDLQ<TestPayload>("same-dlq");
    
    assertEquals(dlq1, dlq2); // Should be same instance
  });

  await t.step("should get DLQ by name", async () => {
    const manager = new DLQManager();
    
    manager.getOrCreateDLQ<TestPayload>("get-test");
    
    const dlq = manager.getDLQ<TestPayload>("get-test");
    assertExists(dlq);
    assertEquals(dlq?.getName(), "get-test");
    
    const nonExistent = manager.getDLQ<TestPayload>("non-existent");
    assertEquals(nonExistent, undefined);
  });

  await t.step("should remove DLQs", async () => {
    const manager = new DLQManager();
    
    manager.getOrCreateDLQ<TestPayload>("removable-dlq");
    assertEquals(manager.getQueueNames().includes("removable-dlq"), true);
    
    const removeResult = await manager.removeDLQ("removable-dlq");
    assertEquals(Result.isOk(removeResult), true);
    assertEquals(Result.isOk(removeResult) && removeResult.value, true);
    
    assertEquals(manager.getQueueNames().includes("removable-dlq"), false);
    
    // Try to remove non-existent
    const removeNonExistentResult = await manager.removeDLQ("non-existent");
    assertEquals(Result.isOk(removeNonExistentResult), true);
    assertEquals(Result.isOk(removeNonExistentResult) && removeNonExistentResult.value, false);
  });

  await t.step("should provide aggregated statistics", async () => {
    const manager = new DLQManager();
    
    const dlq1 = manager.getOrCreateDLQ<TestPayload>("stats-dlq-1");
    const dlq2 = manager.getOrCreateDLQ<TestPayload>("stats-dlq-2");
    
    // Add entries to both DLQs
    await dlq1.add({
      payload: { message: "stats-1", value: 1 },
      error: new Error("Stats error 1"),
      originalQueue: "stats-queue-1",
      attemptCount: 1,
      maxAttempts: 3,
    });

    await dlq2.add({
      payload: { message: "stats-2", value: 2 },
      error: new Error("Stats error 2"),
      originalQueue: "stats-queue-2",
      attemptCount: 1,
      maxAttempts: 3,
    });

    const aggregatedStatsResult = await manager.getAggregatedStats();
    assertEquals(Result.isOk(aggregatedStatsResult), true);
    
    if (Result.isOk(aggregatedStatsResult)) {
      const stats = aggregatedStatsResult.value;
      assertExists(stats["stats-dlq-1"]);
      assertExists(stats["stats-dlq-2"]);
      assertEquals(stats["stats-dlq-1"].totalEntries, 1);
      assertEquals(stats["stats-dlq-2"].totalEntries, 1);
    }
  });

  await t.step("should process all DLQs", async () => {
    const manager = new DLQManager();
    
    const dlq1 = manager.getOrCreateDLQ<TestPayload>("process-all-1");
    const dlq2 = manager.getOrCreateDLQ<TestPayload>("process-all-2");
    
    await dlq1.add({
      payload: { message: "process-all-1", value: 1 },
      error: new Error("Process all error 1"),
      originalQueue: "process-all-queue-1",
      attemptCount: 1,
      maxAttempts: 3,
    });

    await dlq2.add({
      payload: { message: "process-all-2", value: 2 },
      error: new Error("Process all error 2"),
      originalQueue: "process-all-queue-2",
      attemptCount: 1,
      maxAttempts: 3,
    });

    const processAllResult = await manager.processAll<TestPayload>(async (_entry) => {
      return Result.ok(undefined); // Always succeed
    });

    assertEquals(Result.isOk(processAllResult), true);
    
    if (Result.isOk(processAllResult)) {
      const results = processAllResult.value;
      assertExists(results["process-all-1"]);
      assertExists(results["process-all-2"]);
      assertEquals(results["process-all-1"].processed, 1);
      assertEquals(results["process-all-1"].succeeded, 1);
      assertEquals(results["process-all-2"].processed, 1);
      assertEquals(results["process-all-2"].succeeded, 1);
    }
  });

  await t.step("should close all DLQs", async () => {
    const manager = new DLQManager();
    
    manager.getOrCreateDLQ<TestPayload>("close-all-1");
    manager.getOrCreateDLQ<TestPayload>("close-all-2");
    
    assertEquals(manager.getQueueNames().length, 2);
    
    const closeAllResult = await manager.closeAll();
    assertEquals(Result.isOk(closeAllResult), true);
    
    assertEquals(manager.getQueueNames().length, 0);
  });
});