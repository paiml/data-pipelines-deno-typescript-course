import { assertEquals, assertExists } from "@std/assert";
import { 
  GracefulDegradation, 
  DegradationRules,
  DegradationManager,
  type HealthCheck 
} from "../../../src/shared/resilience/graceful-degradation.ts";
import { Result } from "../../../src/shared/types/result.ts";

Deno.test("GracefulDegradation", async (t) => {
  await t.step("should register and run health checks", async () => {
    const degradation = new GracefulDegradation("test-service");
    
    degradation.registerHealthCheck("database", async () => {
      return Result.ok({
        name: "database",
        status: "healthy" as const,
        responseTime: 50,
        timestamp: Date.now(),
      });
    });

    degradation.registerHealthCheck("cache", async () => {
      return Result.ok({
        name: "cache",
        status: "degraded" as const,
        responseTime: 200,
        timestamp: Date.now(),
      });
    });

    const healthResult = await degradation.runHealthChecks();
    assertEquals(Result.isOk(healthResult), true);
    
    if (Result.isOk(healthResult)) {
      assertEquals(healthResult.value.length, 2);
      assertEquals(healthResult.value.find(hc => hc.name === "database")?.status, "healthy");
      assertEquals(healthResult.value.find(hc => hc.name === "cache")?.status, "degraded");
    }
    
    degradation.close();
  });

  await t.step("should evaluate degradation rules", async () => {
    const degradation = new GracefulDegradation("rule-test");
    
    // Add rule that activates when any health check is down
    degradation.addDegradationRule({
      name: "test_rule",
      condition: (healthChecks) => {
        return healthChecks.some(hc => hc.status === "down");
      },
      strategy: "fallback",
      isEnabled: true,
      priority: 100,
    });

    const healthChecks: HealthCheck[] = [
      {
        name: "service1",
        status: "healthy",
        responseTime: 100,
        timestamp: Date.now(),
      },
      {
        name: "service2",
        status: "down",
        responseTime: 5000,
        timestamp: Date.now(),
      },
    ];

    const evaluationResult = await degradation.evaluateDegradation(healthChecks);
    assertEquals(Result.isOk(evaluationResult), true);
    
    if (Result.isOk(evaluationResult)) {
      assertEquals(evaluationResult.value, true); // Should be degraded
    }

    assertEquals(degradation.isDegraded(), true);
    assertEquals(degradation.getActiveRules().length, 1);
    assertEquals(degradation.getActiveRules()[0].name, "test_rule");
    
    degradation.close();
  });

  await t.step("should execute with degradation handling", async () => {
    const degradation = new GracefulDegradation("execution-test", {
      enableAutoMonitoring: false,
    });
    
    let fallbackUsed = false;
    
    // Add degradation rule
    degradation.addDegradationRule({
      name: "always_degrade",
      condition: () => true, // Always activate
      strategy: "fallback",
      fallbackFn: async () => {
        fallbackUsed = true;
        return "fallback-result";
      },
      isEnabled: true,
      priority: 100,
    });

    // Register failing health check
    degradation.registerHealthCheck("failing", async () => {
      return Result.ok({
        name: "failing",
        status: "down" as const,
        responseTime: 1000,
        timestamp: Date.now(),
      });
    });

    const result = await degradation.executeWithDegradation(async () => {
      throw new Error("Primary function failed");
    });

    assertEquals(Result.isOk(result), true);
    if (Result.isOk(result)) {
      assertEquals(result.value, "fallback-result");
    }
    assertEquals(fallbackUsed, true);
    
    degradation.close();
  });

  await t.step("should handle health check removal", async () => {
    const degradation = new GracefulDegradation("remove-test");
    
    degradation.registerHealthCheck("removable", async () => {
      return Result.ok({
        name: "removable",
        status: "healthy" as const,
        responseTime: 50,
        timestamp: Date.now(),
      });
    });

    const healthResult1 = await degradation.runHealthChecks();
    assertEquals(Result.isOk(healthResult1), true);
    if (Result.isOk(healthResult1)) {
      assertEquals(healthResult1.value.length, 1);
    }

    const removed = degradation.removeHealthCheck("removable");
    assertEquals(removed, true);

    const healthResult2 = await degradation.runHealthChecks();
    assertEquals(Result.isOk(healthResult2), true);
    if (Result.isOk(healthResult2)) {
      assertEquals(healthResult2.value.length, 0);
    }
    
    degradation.close();
  });

  await t.step("should handle rule management", async () => {
    const degradation = new GracefulDegradation("rule-management");
    
    const rule = {
      name: "test_rule",
      condition: () => false,
      strategy: "circuit-breaker" as const,
      isEnabled: true,
      priority: 50,
    };

    degradation.addDegradationRule(rule);
    assertEquals(degradation.getAllRules().length, 1);

    const toggleResult = degradation.toggleRule("test_rule", false);
    assertEquals(toggleResult, true);
    assertEquals(degradation.getAllRules()[0].isEnabled, false);

    const removeResult = degradation.removeDegradationRule("test_rule");
    assertEquals(removeResult, true);
    assertEquals(degradation.getAllRules().length, 0);
    
    degradation.close();
  });

  await t.step("should track state correctly", async () => {
    const degradation = new GracefulDegradation("state-test");
    
    const initialState = degradation.getState();
    assertEquals(initialState.isActive, false);
    assertEquals(initialState.activeRules.length, 0);
    assertEquals(initialState.healthStatus, "healthy");
    assertEquals(initialState.failureCount, 0);
    assertEquals(initialState.successCount, 0);

    // Add a rule that always activates
    degradation.addDegradationRule({
      name: "always_active",
      condition: () => true,
      strategy: "fallback",
      isEnabled: true,
      priority: 100,
    });

    await degradation.evaluateDegradation([]);
    
    const activeState = degradation.getState();
    assertEquals(activeState.isActive, true);
    assertEquals(activeState.activeRules.includes("always_active"), true);
    
    degradation.close();
  });

  await t.step("should handle auto-monitoring", async () => {
    const degradation = new GracefulDegradation("monitoring-test", {
      enableAutoMonitoring: true,
      healthCheckInterval: 100, // 100ms for testing
    });
    
    degradation.registerHealthCheck("monitor", async () => {
      return Result.ok({
        name: "monitor",
        status: "healthy" as const,
        responseTime: 50,
        timestamp: Date.now(),
      });
    });

    // Wait a bit to let monitoring run
    await new Promise(resolve => setTimeout(resolve, 150));
    
    const state = degradation.getState();
    assertEquals(state.totalChecks > 0, true);
    
    degradation.stopMonitoring();
    degradation.close();
  });

  await t.step("should reset state", async () => {
    const degradation = new GracefulDegradation("reset-test");
    
    // Add rule and activate
    degradation.addDegradationRule({
      name: "reset_rule",
      condition: () => true,
      strategy: "fallback",
      isEnabled: true,
      priority: 100,
    });

    await degradation.evaluateDegradation([]);
    assertEquals(degradation.isDegraded(), true);

    degradation.reset();
    
    const state = degradation.getState();
    assertEquals(state.isActive, false);
    assertEquals(state.activeRules.length, 0);
    assertEquals(state.healthStatus, "healthy");
    assertEquals(state.failureCount, 0);
    assertEquals(state.successCount, 0);
    
    degradation.close();
  });
});

Deno.test("DegradationRules", async (t) => {
  await t.step("should create high error rate rule", async () => {
    const rule = DegradationRules.highErrorRate(0.6);
    
    assertEquals(rule.name, "high_error_rate");
    assertEquals(rule.strategy, "circuit-breaker");
    assertEquals(rule.priority, 100);
    
    const healthChecksHigh = [
      { name: "s1", status: "down" as const, responseTime: 100, timestamp: Date.now() },
      { name: "s2", status: "down" as const, responseTime: 100, timestamp: Date.now() },
      { name: "s3", status: "healthy" as const, responseTime: 50, timestamp: Date.now() },
    ];
    
    const healthChecksLow = [
      { name: "s1", status: "healthy" as const, responseTime: 50, timestamp: Date.now() },
      { name: "s2", status: "healthy" as const, responseTime: 50, timestamp: Date.now() },
      { name: "s3", status: "down" as const, responseTime: 100, timestamp: Date.now() },
    ];
    
    assertEquals(rule.condition(healthChecksHigh), true);
    assertEquals(rule.condition(healthChecksLow), false);
  });

  await t.step("should create high latency rule", async () => {
    const rule = DegradationRules.highLatency(1000);
    
    assertEquals(rule.name, "high_latency");
    assertEquals(rule.strategy, "rate-limit");
    
    const healthChecksHighLatency = [
      { name: "s1", status: "healthy" as const, responseTime: 1500, timestamp: Date.now() },
      { name: "s2", status: "healthy" as const, responseTime: 1200, timestamp: Date.now() },
    ];
    
    const healthChecksLowLatency = [
      { name: "s1", status: "healthy" as const, responseTime: 200, timestamp: Date.now() },
      { name: "s2", status: "healthy" as const, responseTime: 300, timestamp: Date.now() },
    ];
    
    assertEquals(rule.condition(healthChecksHighLatency), true);
    assertEquals(rule.condition(healthChecksLowLatency), false);
  });

  await t.step("should create service down rule", async () => {
    const rule = DegradationRules.serviceDown();
    
    assertEquals(rule.name, "service_down");
    assertEquals(rule.strategy, "fallback");
    assertEquals(rule.priority, 200);
    
    const healthChecksAllDown = [
      { name: "s1", status: "down" as const, responseTime: 5000, timestamp: Date.now() },
      { name: "s2", status: "down" as const, responseTime: 5000, timestamp: Date.now() },
    ];
    
    const healthChecksMixed = [
      { name: "s1", status: "healthy" as const, responseTime: 100, timestamp: Date.now() },
      { name: "s2", status: "down" as const, responseTime: 5000, timestamp: Date.now() },
    ];
    
    assertEquals(rule.condition(healthChecksAllDown), true);
    assertEquals(rule.condition(healthChecksMixed), false);
  });

  await t.step("should create partial degradation rule", async () => {
    const rule = DegradationRules.partialDegradation(0.4);
    
    assertEquals(rule.name, "partial_degradation");
    assertEquals(rule.strategy, "feature-toggle");
    
    const healthChecksHighDegradation = [
      { name: "s1", status: "degraded" as const, responseTime: 500, timestamp: Date.now() },
      { name: "s2", status: "critical" as const, responseTime: 800, timestamp: Date.now() },
      { name: "s3", status: "healthy" as const, responseTime: 100, timestamp: Date.now() },
    ];
    
    const healthChecksLowDegradation = [
      { name: "s1", status: "healthy" as const, responseTime: 100, timestamp: Date.now() },
      { name: "s2", status: "healthy" as const, responseTime: 150, timestamp: Date.now() },
      { name: "s3", status: "degraded" as const, responseTime: 300, timestamp: Date.now() },
    ];
    
    assertEquals(rule.condition(healthChecksHighDegradation), true);
    assertEquals(rule.condition(healthChecksLowDegradation), false);
  });
});

Deno.test("DegradationManager", async (t) => {
  await t.step("should register and manage multiple services", async () => {
    const manager = new DegradationManager();
    
    const service1 = new GracefulDegradation("service-1");
    const service2 = new GracefulDegradation("service-2");
    
    manager.registerService(service1);
    manager.registerService(service2);
    
    const names = manager.getServiceNames();
    assertEquals(names.length, 2);
    assertEquals(names.includes("service-1"), true);
    assertEquals(names.includes("service-2"), true);
    
    assertExists(manager.getService("service-1"));
    assertEquals(manager.getService("service-1"), service1);
    assertEquals(manager.getService("non-existent"), undefined);
    
    manager.closeAll();
  });

  await t.step("should remove services", async () => {
    const manager = new DegradationManager();
    const service = new GracefulDegradation("removable-service");
    
    manager.registerService(service);
    assertEquals(manager.getServiceNames().includes("removable-service"), true);
    
    const removed = manager.removeService("removable-service");
    assertEquals(removed, true);
    assertEquals(manager.getServiceNames().includes("removable-service"), false);
    
    const removedAgain = manager.removeService("removable-service");
    assertEquals(removedAgain, false);
    
    manager.closeAll();
  });

  await t.step("should calculate system health", async () => {
    const manager = new DegradationManager();
    
    const healthyService = new GracefulDegradation("healthy");
    const degradedService = new GracefulDegradation("degraded");
    
    // Set up services with different health states
    healthyService.registerHealthCheck("check", async () => {
      return Result.ok({
        name: "check",
        status: "healthy" as const,
        responseTime: 100,
        timestamp: Date.now(),
      });
    });
    
    degradedService.registerHealthCheck("check", async () => {
      return Result.ok({
        name: "check",
        status: "degraded" as const,
        responseTime: 500,
        timestamp: Date.now(),
      });
    });
    
    // Run health checks to update states
    await healthyService.runHealthChecks();
    await degradedService.runHealthChecks();
    
    manager.registerService(healthyService);
    manager.registerService(degradedService);
    
    const systemHealth = manager.getSystemHealth();
    
    assertEquals(systemHealth.healthyServices.includes("healthy"), true);
    assertEquals(systemHealth.degradedServices.includes("degraded"), true);
    assertEquals(systemHealth.services.healthy, "healthy");
    assertEquals(systemHealth.services.degraded, "degraded");
    assertEquals(systemHealth.overall, "degraded"); // System is degraded because one service is degraded
    
    manager.closeAll();
  });

  await t.step("should start and stop monitoring for all services", async () => {
    const manager = new DegradationManager();
    
    const service1 = new GracefulDegradation("monitor-1");
    const service2 = new GracefulDegradation("monitor-2");
    
    manager.registerService(service1);
    manager.registerService(service2);
    
    // Start monitoring
    manager.startAllMonitoring();
    
    // Wait briefly
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Stop monitoring
    manager.stopAllMonitoring();
    
    // Services should still be accessible
    assertEquals(manager.getServiceNames().length, 2);
    
    manager.closeAll();
  });

  await t.step("should close all services", async () => {
    const manager = new DegradationManager();
    
    const service1 = new GracefulDegradation("close-1");
    const service2 = new GracefulDegradation("close-2");
    
    manager.registerService(service1);
    manager.registerService(service2);
    
    assertEquals(manager.getServiceNames().length, 2);
    
    manager.closeAll();
    
    assertEquals(manager.getServiceNames().length, 0);
  });
});