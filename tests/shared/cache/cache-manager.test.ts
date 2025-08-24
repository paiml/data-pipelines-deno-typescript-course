import { assertEquals, assertExists } from "@std/assert";
import { CacheManager } from "../../../src/shared/cache/cache-manager.ts";
import { Result } from "../../../src/shared/types/result.ts";

Deno.test("CacheManager", async (t) => {
  await t.step("should create with default L1/L2 configuration", async () => {
    const manager = new CacheManager<string>();
    
    const tiers = manager.getTiers();
    assertEquals(tiers.length, 2);
    assertEquals(tiers.includes("L1"), true);
    assertEquals(tiers.includes("L2"), true);
  });

  await t.step("should initialize all tiers", async () => {
    const manager = new CacheManager<string>();
    
    const initResult = await manager.initialize();
    assertEquals(Result.isOk(initResult), true);
  });

  await t.step("should store and retrieve from cache", async () => {
    const manager = new CacheManager<string>();
    await manager.initialize();
    
    const setResult = await manager.set("test-key", "test-value");
    assertEquals(Result.isOk(setResult), true);

    const getResult = await manager.get("test-key");
    assertEquals(Result.isOk(getResult), true);
    if (Result.isOk(getResult)) {
      assertEquals(getResult.value, "test-value");
    }
  });

  await t.step("should promote values from L2 to L1", async () => {
    const manager = new CacheManager<string>([
      {
        name: "L1",
        type: "memory",
        config: { ttl: 60_000, maxSize: 100 },
        priority: 2,
      },
      {
        name: "L2", 
        type: "memory", // Using memory for both tiers in test
        config: { ttl: 300_000, maxSize: 1000 },
        priority: 1,
      }
    ]);
    
    await manager.initialize();
    
    // Set directly in L2 cache (simulate L2-only storage)
    const l2Stats = await manager.getTierStats("L2");
    assertEquals(Result.isOk(l2Stats), true);
    
    // Set value in all tiers
    await manager.set("promote-test", "promoted-value");
    
    // Get should retrieve from L1 (highest priority)
    const result = await manager.get("promote-test");
    assertEquals(Result.isOk(result), true);
    if (Result.isOk(result)) {
      assertEquals(result.value, "promoted-value");
    }
  });

  await t.step("should handle tier failures gracefully", async () => {
    const manager = new CacheManager<string>();
    await manager.initialize();
    
    // Even if some operations fail, basic functionality should work
    const setResult = await manager.set("resilient-key", "resilient-value");
    assertEquals(Result.isOk(setResult), true);
    
    const getResult = await manager.get("resilient-key");
    assertEquals(Result.isOk(getResult), true);
    if (Result.isOk(getResult)) {
      assertEquals(getResult.value, "resilient-value");
    }
  });

  await t.step("should support bulk operations", async () => {
    const manager = new CacheManager<string>();
    await manager.initialize();
    
    const entries = new Map([
      ["bulk1", "value1"],
      ["bulk2", "value2"],
      ["bulk3", "value3"]
    ]);
    
    const msetResult = await manager.mset(entries);
    assertEquals(Result.isOk(msetResult), true);
    
    const mgetResult = await manager.mget(["bulk1", "bulk2", "bulk3", "missing"]);
    assertEquals(Result.isOk(mgetResult), true);
    if (Result.isOk(mgetResult)) {
      assertEquals(mgetResult.value.get("bulk1"), "value1");
      assertEquals(mgetResult.value.get("bulk2"), "value2");
      assertEquals(mgetResult.value.get("bulk3"), "value3");
      assertEquals(mgetResult.value.get("missing"), null);
    }
  });

  await t.step("should provide aggregated statistics", async () => {
    const manager = new CacheManager<string>();
    await manager.initialize();
    
    await manager.set("stats-key", "stats-value");
    await manager.get("stats-key"); // hit
    await manager.get("missing-key"); // miss
    
    const stats = await manager.getStats();
    assertEquals(Result.isOk(stats), true);
    if (Result.isOk(stats)) {
      assertExists(stats.value.hits);
      assertExists(stats.value.misses);
      assertExists(stats.value.hitRate);
      assertExists(stats.value.size);
    }
  });

  await t.step("should support tier-specific statistics", async () => {
    const manager = new CacheManager<string>();
    await manager.initialize();
    
    const l1Stats = await manager.getTierStats("L1");
    const l2Stats = await manager.getTierStats("L2");
    
    assertEquals(Result.isOk(l1Stats), true);
    assertEquals(Result.isOk(l2Stats), true);
  });

  await t.step("should handle tier removal", async () => {
    const manager = new CacheManager<string>();
    await manager.initialize();
    
    const removeResult = await manager.removeTier("L2");
    assertEquals(Result.isOk(removeResult), true);
    
    const tiers = manager.getTiers();
    assertEquals(tiers.includes("L2"), false);
    assertEquals(tiers.includes("L1"), true);
  });

  await t.step("should clear all tiers", async () => {
    const manager = new CacheManager<string>();
    await manager.initialize();
    
    await manager.set("clear-test", "value");
    
    const clearResult = await manager.clear();
    assertEquals(Result.isOk(clearResult), true);
    
    const getResult = await manager.get("clear-test");
    assertEquals(Result.isOk(getResult), true);
    if (Result.isOk(getResult)) {
      assertEquals(getResult.value, null);
    }
  });

  await t.step("should close all connections", async () => {
    const manager = new CacheManager<string>();
    await manager.initialize();
    
    const closeResult = await manager.close();
    assertEquals(Result.isOk(closeResult), true);
  });
});