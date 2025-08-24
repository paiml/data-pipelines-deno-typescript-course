import { assertEquals, assertExists } from "@std/assert";
import { RetryPolicy, RetryPolicies, RetryPolicyRegistry } from "../../../src/shared/resilience/retry-policy.ts";
import { Result } from "../../../src/shared/types/result.ts";

Deno.test("RetryPolicy", async (t) => {
  await t.step("should retry failed operations", async () => {
    let attemptCount = 0;
    const policy = new RetryPolicy("test", {
      maxAttempts: 3,
      initialDelay: 10,
      strategy: "fixed",
      jitterRange: 0, // No jitter for predictable tests
    });

    const result = await policy.execute(async () => {
      attemptCount++;
      if (attemptCount < 3) {
        throw new Error("Simulated failure");
      }
      return "success";
    });

    assertEquals(Result.isOk(result), true);
    if (Result.isOk(result)) {
      assertEquals(result.value, "success");
    }
    assertEquals(attemptCount, 3);
  });

  await t.step("should fail after max attempts", async () => {
    let attemptCount = 0;
    const policy = new RetryPolicy("test", {
      maxAttempts: 2,
      initialDelay: 10,
      strategy: "fixed",
      jitterRange: 0,
    });

    const result = await policy.execute(async () => {
      attemptCount++;
      throw new Error("Always fails");
    });

    assertEquals(Result.isErr(result), true);
    assertEquals(attemptCount, 2);
  });

  await t.step("should use exponential backoff", async () => {
    const delays: number[] = [];
    let attemptCount = 0;
    
    const policy = new RetryPolicy("exponential", {
      maxAttempts: 3,
      initialDelay: 100,
      strategy: "exponential",
      backoffMultiplier: 2,
      jitterRange: 0,
    });

    const startTime = Date.now();
    await policy.execute(
      async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error("Retry needed");
        }
        return "success";
      },
      (attempt) => {
        delays.push(attempt.delay);
      }
    );

    const totalTime = Date.now() - startTime;
    
    // First delay: 100ms, second delay: 200ms
    assertEquals(delays.length, 2);
    assertEquals(delays[0], 100);
    assertEquals(delays[1], 200);
    
    // Total time should be at least 300ms (100 + 200)
    assertEquals(totalTime >= 300, true);
  });

  await t.step("should use linear backoff", async () => {
    const delays: number[] = [];
    let attemptCount = 0;
    
    const policy = new RetryPolicy("linear", {
      maxAttempts: 3,
      initialDelay: 50,
      strategy: "linear",
      jitterRange: 0,
    });

    await policy.execute(
      async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error("Retry needed");
        }
        return "success";
      },
      (attempt) => {
        delays.push(attempt.delay);
      }
    );

    // Linear: 50ms * 1, 50ms * 2
    assertEquals(delays.length, 2);
    assertEquals(delays[0], 50);
    assertEquals(delays[1], 100);
  });

  await t.step("should respect max delay", async () => {
    const delays: number[] = [];
    let attemptCount = 0;
    
    const policy = new RetryPolicy("capped", {
      maxAttempts: 4,
      initialDelay: 100,
      maxDelay: 150,
      strategy: "exponential",
      backoffMultiplier: 2,
      jitterRange: 0,
    });

    await policy.execute(
      async () => {
        attemptCount++;
        if (attemptCount < 4) {
          throw new Error("Retry needed");
        }
        return "success";
      },
      (attempt) => {
        delays.push(attempt.delay);
      }
    );

    // Exponential: 100, 200, 400 -> but capped at 150
    assertEquals(delays.length, 3);
    assertEquals(delays[0], 100);
    assertEquals(delays[1], 150); // Capped
    assertEquals(delays[2], 150); // Capped
  });

  await t.step("should handle retryable and non-retryable errors", async () => {
    let attemptCount = 0;
    const policy = new RetryPolicy("selective", {
      maxAttempts: 5,
      initialDelay: 10,
      retryableErrors: ["TIMEOUT", /network/i],
      nonRetryableErrors: ["INVALID", /permission/i],
      jitterRange: 0,
    });

    // Test retryable error
    const retryableResult = await policy.execute(async () => {
      attemptCount++;
      if (attemptCount === 1) {
        throw new Error("TIMEOUT occurred");
      }
      return "success";
    });

    assertEquals(Result.isOk(retryableResult), true);
    assertEquals(attemptCount, 2);

    // Reset for next test
    attemptCount = 0;

    // Test non-retryable error
    const nonRetryableResult = await policy.execute(async () => {
      attemptCount++;
      throw new Error("INVALID request");
    });

    assertEquals(Result.isErr(nonRetryableResult), true);
    assertEquals(attemptCount, 1); // Should not retry
  });

  await t.step("should use custom delay function", async () => {
    const delays: number[] = [];
    let attemptCount = 0;
    
    const policy = new RetryPolicy("custom", {
      maxAttempts: 3,
      initialDelay: 100, // Will be ignored
      jitterRange: 0,
    });

    policy.setCustomDelayFunction((attempt, _error) => {
      return attempt * 25; // 25, 50, 75
    });

    await policy.execute(
      async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error("Custom retry");
        }
        return "success";
      },
      (attempt) => {
        delays.push(attempt.delay);
      }
    );

    assertEquals(delays.length, 2);
    assertEquals(delays[0], 25);  // attempt 1 * 25
    assertEquals(delays[1], 50);  // attempt 2 * 25
  });

  await t.step("should track metrics", async () => {
    const policy = new RetryPolicy("metrics", {
      maxAttempts: 3,
      initialDelay: 10,
      jitterRange: 0,
    });

    let firstAttempt = true;
    
    // Successful retry - fails first, succeeds on second attempt
    await policy.execute(async () => {
      if (firstAttempt) {
        firstAttempt = false;
        throw new Error("First attempt fails");
      }
      return "success";
    });

    // Failed retry - always fails
    await policy.execute(async () => {
      throw new Error("Always fails");
    });

    const metrics = policy.getMetrics();
    
    assertEquals(metrics.totalAttempts, 2);
    assertEquals(metrics.successfulRetries, 1); // One successful retry (failed first, then succeeded)
    assertEquals(metrics.failedRetries, 1);     // One completely failed execution
    assertEquals(metrics.averageAttempts > 1, true);
    assertExists(metrics.lastRetryTime);
  });

  await t.step("should reset metrics", async () => {
    const policy = new RetryPolicy("reset", {
      maxAttempts: 2,
      initialDelay: 10,
    });

    await policy.execute(async () => "success");

    let metrics = policy.getMetrics();
    assertEquals(metrics.totalAttempts, 1);

    policy.resetMetrics();

    metrics = policy.getMetrics();
    assertEquals(metrics.totalAttempts, 0);
    assertEquals(metrics.successfulRetries, 0);
    assertEquals(metrics.failedRetries, 0);
    assertEquals(metrics.averageAttempts, 0);
    assertEquals(metrics.totalDelayTime, 0);
  });

  await t.step("should provide configuration details", async () => {
    const config = {
      maxAttempts: 5,
      initialDelay: 2000,
      maxDelay: 30_000,
      strategy: "exponential" as const,
      backoffMultiplier: 2.5,
      jitterRange: 0.2,
    };

    const policy = new RetryPolicy("config-test", config);

    assertEquals(policy.getName(), "config-test");
    
    const retrievedConfig = policy.getConfig();
    assertEquals(retrievedConfig.maxAttempts, 5);
    assertEquals(retrievedConfig.initialDelay, 2000);
    assertEquals(retrievedConfig.maxDelay, 30_000);
    assertEquals(retrievedConfig.strategy, "exponential");
    assertEquals(retrievedConfig.backoffMultiplier, 2.5);
    assertEquals(retrievedConfig.jitterRange, 0.2);
  });
});

Deno.test("RetryPolicies", async (t) => {
  await t.step("should create quick policy", async () => {
    const policy = RetryPolicies.quick("test-quick");
    const config = policy.getConfig();
    
    assertEquals(config.maxAttempts, 3);
    assertEquals(config.initialDelay, 100);
    assertEquals(config.maxDelay, 1000);
    assertEquals(config.strategy, "exponential");
  });

  await t.step("should create standard policy", async () => {
    const policy = RetryPolicies.standard("test-standard");
    const config = policy.getConfig();
    
    assertEquals(config.maxAttempts, 5);
    assertEquals(config.initialDelay, 1000);
    assertEquals(config.maxDelay, 30_000);
    assertEquals(config.strategy, "exponential");
  });

  await t.step("should create aggressive policy", async () => {
    const policy = RetryPolicies.aggressive("test-aggressive");
    const config = policy.getConfig();
    
    assertEquals(config.maxAttempts, 10);
    assertEquals(config.initialDelay, 500);
    assertEquals(config.maxDelay, 60_000);
    assertEquals(config.strategy, "exponential");
  });

  await t.step("should create network policy", async () => {
    const policy = RetryPolicies.network("test-network");
    const config = policy.getConfig();
    
    assertEquals(config.maxAttempts, 5);
    assertExists(config.retryableErrors);
    assertExists(config.nonRetryableErrors);
    
    // Test that network errors are retryable
    let attemptCount = 0;
    const result = await policy.execute(async () => {
      attemptCount++;
      if (attemptCount === 1) {
        throw new Error("ECONNREFUSED");
      }
      return "connected";
    });

    assertEquals(Result.isOk(result), true);
    assertEquals(attemptCount, 2);
  });

  await t.step("should create database policy", async () => {
    const policy = RetryPolicies.database("test-db");
    const config = policy.getConfig();
    
    assertEquals(config.maxAttempts, 7);
    assertExists(config.retryableErrors);
    assertExists(config.nonRetryableErrors);
  });
});

Deno.test("RetryPolicyRegistry", async (t) => {
  await t.step("should register and retrieve policies", async () => {
    const registry = new RetryPolicyRegistry();
    const policy = new RetryPolicy("test-policy", { maxAttempts: 3 });
    
    registry.register(policy);
    
    const retrieved = registry.get("test-policy");
    assertEquals(retrieved?.getName(), "test-policy");
  });

  await t.step("should get or create policies", async () => {
    const registry = new RetryPolicyRegistry();
    
    // Create new policy
    const policy1 = registry.getOrCreate("auto-created", { maxAttempts: 4 });
    assertEquals(policy1.getName(), "auto-created");
    assertEquals(policy1.getConfig().maxAttempts, 4);
    
    // Get existing policy
    const policy2 = registry.getOrCreate("auto-created", { maxAttempts: 5 });
    assertEquals(policy2, policy1); // Should be same instance
    assertEquals(policy2.getConfig().maxAttempts, 4); // Original config preserved
  });

  await t.step("should manage multiple policies", async () => {
    const registry = new RetryPolicyRegistry();
    
    registry.register(new RetryPolicy("policy1"));
    registry.register(new RetryPolicy("policy2"));
    registry.register(new RetryPolicy("policy3"));
    
    const names = registry.getNames();
    assertEquals(names.length, 3);
    assertEquals(names.includes("policy1"), true);
    assertEquals(names.includes("policy2"), true);
    assertEquals(names.includes("policy3"), true);
  });

  await t.step("should remove policies", async () => {
    const registry = new RetryPolicyRegistry();
    registry.register(new RetryPolicy("removable"));
    
    assertEquals(registry.get("removable")?.getName(), "removable");
    
    const removed = registry.remove("removable");
    assertEquals(removed, true);
    assertEquals(registry.get("removable"), undefined);
    
    const removedAgain = registry.remove("removable");
    assertEquals(removedAgain, false);
  });

  await t.step("should aggregate metrics", async () => {
    const registry = new RetryPolicyRegistry();
    
    const policy1 = new RetryPolicy("metrics1", { maxAttempts: 2 });
    const policy2 = new RetryPolicy("metrics2", { maxAttempts: 2 });
    
    registry.register(policy1);
    registry.register(policy2);
    
    // Generate some metrics
    await policy1.execute(async () => "success");
    await policy2.execute(async () => { throw new Error("fail"); });
    
    const allMetrics = registry.getAllMetrics();
    
    assertExists(allMetrics.metrics1);
    assertExists(allMetrics.metrics2);
    assertEquals(allMetrics.metrics1.totalAttempts, 1);
    assertEquals(allMetrics.metrics2.totalAttempts, 1);
    assertEquals(allMetrics.metrics2.failedRetries, 1);
  });

  await t.step("should reset all metrics", async () => {
    const registry = new RetryPolicyRegistry();
    
    const policy = new RetryPolicy("reset-test");
    registry.register(policy);
    
    await policy.execute(async () => "success");
    
    let metrics = registry.getAllMetrics();
    assertEquals(metrics["reset-test"].totalAttempts, 1);
    
    registry.resetAllMetrics();
    
    metrics = registry.getAllMetrics();
    assertEquals(metrics["reset-test"].totalAttempts, 0);
  });

  await t.step("should clear all policies", async () => {
    const registry = new RetryPolicyRegistry();
    
    registry.register(new RetryPolicy("clear1"));
    registry.register(new RetryPolicy("clear2"));
    
    assertEquals(registry.getNames().length, 2);
    
    registry.clear();
    
    assertEquals(registry.getNames().length, 0);
    assertEquals(registry.get("clear1"), undefined);
    assertEquals(registry.get("clear2"), undefined);
  });
});