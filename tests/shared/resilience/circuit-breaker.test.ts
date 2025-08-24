import { assertEquals, assertExists } from "@std/assert";
import { CircuitBreaker, CircuitBreakerRegistry } from "../../../src/shared/resilience/circuit-breaker.ts";
import { Result } from "../../../src/shared/types/result.ts";

Deno.test("CircuitBreaker", async (t) => {
  await t.step("should start in closed state", async () => {
    const breaker = new CircuitBreaker("test-breaker");
    
    const metrics = breaker.getMetrics();
    assertEquals(metrics.state, "CLOSED");
    assertEquals(metrics.failureCount, 0);
    assertEquals(metrics.successCount, 0);
    assertEquals(breaker.canExecute(), true);
  });

  await t.step("should execute successful functions", async () => {
    const breaker = new CircuitBreaker("success-test");
    
    const result = await breaker.execute(async () => {
      return "success";
    });

    assertEquals(Result.isOk(result), true);
    if (Result.isOk(result)) {
      assertEquals(result.value, "success");
    }

    const metrics = breaker.getMetrics();
    assertEquals(metrics.successCount, 1);
    assertEquals(metrics.totalCalls, 1);
    assertEquals(metrics.state, "CLOSED");
  });

  await t.step("should handle failures and open circuit", async () => {
    const breaker = new CircuitBreaker("failure-test", {
      failureThreshold: 2,
      volumeThreshold: 2,
      errorThresholdPercentage: 50,
    });

    // First failure
    const result1 = await breaker.execute(async () => {
      throw new Error("Test failure 1");
    });
    assertEquals(Result.isErr(result1), true);
    assertEquals(breaker.getMetrics().state, "CLOSED");

    // Second failure - should open circuit
    const result2 = await breaker.execute(async () => {
      throw new Error("Test failure 2");
    });
    assertEquals(Result.isErr(result2), true);
    assertEquals(breaker.getMetrics().state, "OPEN");
    assertEquals(breaker.canExecute(), false);
  });

  await t.step("should use fallback when circuit is open", async () => {
    const breaker = new CircuitBreaker("fallback-test", {
      failureThreshold: 1,
      volumeThreshold: 1,
    });

    // Force circuit to open
    await breaker.execute(async () => {
      throw new Error("Force open");
    });
    assertEquals(breaker.getMetrics().state, "OPEN");

    // Execute with fallback
    const result = await breaker.execute(
      async () => {
        throw new Error("Should not execute");
      },
      () => Promise.resolve("fallback-result")
    );

    assertEquals(Result.isOk(result), true);
    if (Result.isOk(result)) {
      assertEquals(result.value, "fallback-result");
    }
  });

  await t.step("should transition to half-open after timeout", async () => {
    const breaker = new CircuitBreaker("half-open-test", {
      failureThreshold: 1,
      volumeThreshold: 1,
      timeout: 50, // 50ms timeout for testing
      successThreshold: 2, // Need 2 successes to close
    });

    // Force circuit to open
    await breaker.execute(async () => {
      throw new Error("Force open");
    });
    assertEquals(breaker.getMetrics().state, "OPEN");

    // Wait for timeout
    await new Promise(resolve => setTimeout(resolve, 100));

    // Next execution should transition to half-open and stay there (need 2 successes to close)
    const result1 = await breaker.execute(async () => {
      return "recovery-success-1";
    });

    assertEquals(Result.isOk(result1), true);
    if (Result.isOk(result1)) {
      assertEquals(result1.value, "recovery-success-1");
    }
    assertEquals(breaker.getMetrics().state, "HALF_OPEN");

    // Second success should close the circuit
    const result2 = await breaker.execute(async () => {
      return "recovery-success-2";
    });

    assertEquals(Result.isOk(result2), true);
    assertEquals(breaker.getMetrics().state, "CLOSED");
  });

  await t.step("should track metrics correctly", async () => {
    const breaker = new CircuitBreaker("metrics-test");

    // Execute some successful calls
    await breaker.execute(async () => "success-1");
    await breaker.execute(async () => "success-2");

    // Execute some failed calls
    await breaker.execute(async () => {
      throw new Error("failure-1");
    });

    const metrics = breaker.getMetrics();
    assertEquals(metrics.successCount, 2);
    assertEquals(metrics.failureCount, 1);
    assertEquals(metrics.totalCalls, 3);
    assertEquals(metrics.errorRate > 0, true);
    assertExists(metrics.lastSuccessTime);
    assertExists(metrics.lastFailureTime);
  });

  await t.step("should reset state", async () => {
    const breaker = new CircuitBreaker("reset-test", {
      failureThreshold: 1,
      volumeThreshold: 1,
    });

    // Force failure and open circuit
    await breaker.execute(async () => {
      throw new Error("Force failure");
    });
    assertEquals(breaker.getMetrics().state, "OPEN");

    // Reset
    breaker.reset();

    const metrics = breaker.getMetrics();
    assertEquals(metrics.state, "CLOSED");
    assertEquals(metrics.failureCount, 0);
    assertEquals(metrics.successCount, 0);
    assertEquals(metrics.totalCalls, 0);
    assertEquals(breaker.canExecute(), true);
  });

  await t.step("should force state transitions", async () => {
    const breaker = new CircuitBreaker("force-test");

    breaker.forceState("OPEN");
    assertEquals(breaker.getMetrics().state, "OPEN");
    assertEquals(breaker.canExecute(), false);

    breaker.forceState("HALF_OPEN");
    assertEquals(breaker.getMetrics().state, "HALF_OPEN");
    assertEquals(breaker.canExecute(), true);

    breaker.forceState("CLOSED");
    assertEquals(breaker.getMetrics().state, "CLOSED");
    assertEquals(breaker.canExecute(), true);
  });

  await t.step("should handle half-open state correctly", async () => {
    const breaker = new CircuitBreaker("half-open-flow", {
      failureThreshold: 1,
      volumeThreshold: 1,
      successThreshold: 2, // Need 2 successes to close
      timeout: 50,
    });

    // Force open
    await breaker.execute(async () => {
      throw new Error("Force open");
    });
    assertEquals(breaker.getMetrics().state, "OPEN");

    // Wait for timeout
    await new Promise(resolve => setTimeout(resolve, 100));

    // First success in half-open
    breaker.forceState("HALF_OPEN");
    await breaker.execute(async () => "success-1");
    assertEquals(breaker.getMetrics().state, "HALF_OPEN");

    // Second success should close circuit
    await breaker.execute(async () => "success-2");
    assertEquals(breaker.getMetrics().state, "CLOSED");

    // Test failure in half-open immediately opens
    breaker.forceState("HALF_OPEN");
    await breaker.execute(async () => {
      throw new Error("Half-open failure");
    });
    assertEquals(breaker.getMetrics().state, "OPEN");
  });
});

Deno.test("CircuitBreakerRegistry", async (t) => {
  await t.step("should create and manage circuit breakers", async () => {
    const registry = new CircuitBreakerRegistry();

    const breaker1 = registry.getOrCreate("breaker-1", {
      failureThreshold: 3,
    });
    const breaker2 = registry.getOrCreate("breaker-2");

    assertEquals(breaker1.getName(), "breaker-1");
    assertEquals(breaker2.getName(), "breaker-2");

    const names = registry.getNames();
    assertEquals(names.length, 2);
    assertEquals(names.includes("breaker-1"), true);
    assertEquals(names.includes("breaker-2"), true);
  });

  await t.step("should return existing breaker", async () => {
    const registry = new CircuitBreakerRegistry();

    const breaker1 = registry.getOrCreate("same-breaker");
    const breaker2 = registry.getOrCreate("same-breaker");

    assertEquals(breaker1, breaker2); // Should be same instance
  });

  await t.step("should get breaker by name", async () => {
    const registry = new CircuitBreakerRegistry();
    
    registry.getOrCreate("test-breaker");
    
    const breaker = registry.get("test-breaker");
    assertExists(breaker);
    assertEquals(breaker.getName(), "test-breaker");

    const nonExistent = registry.get("non-existent");
    assertEquals(nonExistent, undefined);
  });

  await t.step("should remove breakers", async () => {
    const registry = new CircuitBreakerRegistry();
    
    registry.getOrCreate("removable");
    assertEquals(registry.getNames().includes("removable"), true);

    const removed = registry.remove("removable");
    assertEquals(removed, true);
    assertEquals(registry.getNames().includes("removable"), false);

    const removedAgain = registry.remove("removable");
    assertEquals(removedAgain, false);
  });

  await t.step("should get all metrics", async () => {
    const registry = new CircuitBreakerRegistry();
    
    const breaker1 = registry.getOrCreate("metrics-1");
    const breaker2 = registry.getOrCreate("metrics-2");

    // Generate some metrics
    await breaker1.execute(async () => "success");
    await breaker2.execute(async () => {
      throw new Error("failure");
    });

    const allMetrics = registry.getAllMetrics();
    assertExists(allMetrics["metrics-1"]);
    assertExists(allMetrics["metrics-2"]);
    assertEquals(allMetrics["metrics-1"].successCount, 1);
    assertEquals(allMetrics["metrics-2"].failureCount, 1);
  });

  await t.step("should reset all breakers", async () => {
    const registry = new CircuitBreakerRegistry();
    
    const breaker1 = registry.getOrCreate("reset-1");
    const breaker2 = registry.getOrCreate("reset-2");

    // Generate some state
    await breaker1.execute(async () => "success");
    await breaker2.execute(async () => {
      throw new Error("failure");
    });

    assertEquals(breaker1.getMetrics().totalCalls, 1);
    assertEquals(breaker2.getMetrics().totalCalls, 1);

    registry.resetAll();

    assertEquals(breaker1.getMetrics().totalCalls, 0);
    assertEquals(breaker2.getMetrics().totalCalls, 0);
  });

  await t.step("should get breakers by state", async () => {
    const registry = new CircuitBreakerRegistry();
    
    const closedBreaker = registry.getOrCreate("closed", {
      failureThreshold: 5,
    });
    const openBreaker = registry.getOrCreate("open", {
      failureThreshold: 1,
      volumeThreshold: 1,
    });

    // Execute to generate different states
    await closedBreaker.execute(async () => "success");
    await openBreaker.execute(async () => {
      throw new Error("force open");
    });

    const closedBreakers = registry.getByState("CLOSED");
    const openBreakers = registry.getByState("OPEN");

    assertEquals(closedBreakers.length, 1);
    assertEquals(closedBreakers[0].getName(), "closed");
    assertEquals(openBreakers.length, 1);
    assertEquals(openBreakers[0].getName(), "open");
  });

  await t.step("should get health status", async () => {
    const registry = new CircuitBreakerRegistry();
    
    const healthy1 = registry.getOrCreate("healthy-1");
    const healthy2 = registry.getOrCreate("healthy-2");
    const degraded = registry.getOrCreate("degraded", {
      failureThreshold: 1,
      volumeThreshold: 1,
    });

    // Generate states
    await healthy1.execute(async () => "success");
    await healthy2.execute(async () => "success");
    await degraded.execute(async () => {
      throw new Error("degrade");
    });

    const healthStatus = registry.getHealthStatus();
    assertEquals(healthStatus.total, 3);
    assertEquals(healthStatus.healthy, 2);
    assertEquals(healthStatus.failed, 1);
    assertEquals(healthStatus.degraded, 0);
  });
});