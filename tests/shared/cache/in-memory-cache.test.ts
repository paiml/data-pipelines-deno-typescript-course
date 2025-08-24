import { assertEquals, assertExists } from "@std/assert";
import { InMemoryCache } from "../../../src/shared/cache/in-memory-cache.ts";
import { Result } from "../../../src/shared/types/result.ts";

Deno.test("InMemoryCache", async (t) => {
  await t.step("should store and retrieve values", async () => {
    const cache = new InMemoryCache<string>();
    
    const setResult = await cache.set("test-key", "test-value");
    assertEquals(Result.isOk(setResult), true);

    const getResult = await cache.get("test-key");
    assertEquals(Result.isOk(getResult), true);
    if (Result.isOk(getResult)) {
      assertEquals(getResult.value, "test-value");
    }
  });

  await t.step("should return null for non-existent keys", async () => {
    const cache = new InMemoryCache<string>();
    
    const result = await cache.get("non-existent");
    assertEquals(Result.isOk(result), true);
    if (Result.isOk(result)) {
      assertEquals(result.value, null);
    }
  });

  await t.step("should handle TTL expiration", async () => {
    const cache = new InMemoryCache<string>({ ttl: 50 }); // 50ms TTL
    
    await cache.set("expiring-key", "expiring-value");
    
    // Should exist immediately
    let result = await cache.get("expiring-key");
    assertEquals(Result.isOk(result), true);
    if (Result.isOk(result)) {
      assertEquals(result.value, "expiring-value");
    }

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Should be expired now
    result = await cache.get("expiring-key");
    assertEquals(Result.isOk(result), true);
    if (Result.isOk(result)) {
      assertEquals(result.value, null);
    }
  });

  await t.step("should handle custom TTL per key", async () => {
    const cache = new InMemoryCache<string>({ ttl: 1000 }); // Default 1s
    
    await cache.set("short-lived", "value", 50); // 50ms TTL
    await cache.set("long-lived", "value"); // Use default TTL
    
    // Wait for short-lived to expire
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const shortResult = await cache.get("short-lived");
    const longResult = await cache.get("long-lived");
    
    assertEquals(Result.isOk(shortResult), true);
    assertEquals(Result.isOk(longResult), true);
    
    if (Result.isOk(shortResult) && Result.isOk(longResult)) {
      assertEquals(shortResult.value, null); // Expired
      assertEquals(longResult.value, "value"); // Still valid
    }
  });

  await t.step("should delete keys", async () => {
    const cache = new InMemoryCache<string>();
    
    await cache.set("deletable", "value");
    
    const deleteResult = await cache.delete("deletable");
    assertEquals(Result.isOk(deleteResult), true);
    if (Result.isOk(deleteResult)) {
      assertEquals(deleteResult.value, true);
    }
    
    const getResult = await cache.get("deletable");
    assertEquals(Result.isOk(getResult), true);
    if (Result.isOk(getResult)) {
      assertEquals(getResult.value, null);
    }
  });

  await t.step("should check key existence", async () => {
    const cache = new InMemoryCache<string>();
    
    await cache.set("existing", "value");
    
    const hasExisting = await cache.has("existing");
    const hasNonExisting = await cache.has("non-existing");
    
    assertEquals(Result.isOk(hasExisting), true);
    assertEquals(Result.isOk(hasNonExisting), true);
    
    if (Result.isOk(hasExisting) && Result.isOk(hasNonExisting)) {
      assertEquals(hasExisting.value, true);
      assertEquals(hasNonExisting.value, false);
    }
  });

  await t.step("should clear all entries", async () => {
    const cache = new InMemoryCache<string>();
    
    await cache.set("key1", "value1");
    await cache.set("key2", "value2");
    
    const clearResult = await cache.clear();
    assertEquals(Result.isOk(clearResult), true);
    
    const stats = await cache.getStats();
    assertEquals(Result.isOk(stats), true);
    if (Result.isOk(stats)) {
      assertEquals(stats.value.size, 0);
    }
  });

  await t.step("should maintain statistics", async () => {
    const cache = new InMemoryCache<string>();
    
    // Generate hits and misses
    await cache.set("key1", "value1");
    await cache.get("key1"); // hit
    await cache.get("key1"); // hit
    await cache.get("non-existent"); // miss
    
    const stats = await cache.getStats();
    assertEquals(Result.isOk(stats), true);
    if (Result.isOk(stats)) {
      assertEquals(stats.value.hits >= 2, true);
      assertEquals(stats.value.misses >= 1, true);
      assertEquals(stats.value.hitRate > 0, true);
      assertEquals(stats.value.size >= 1, true);
    }
  });

  await t.step("should support pattern matching for keys", async () => {
    const cache = new InMemoryCache<string>();
    
    await cache.set("user:1", "user1");
    await cache.set("user:2", "user2");
    await cache.set("post:1", "post1");
    
    const userKeys = await cache.keys("user:*");
    assertEquals(Result.isOk(userKeys), true);
    if (Result.isOk(userKeys)) {
      assertEquals(userKeys.value.length, 2);
      assertEquals(userKeys.value.includes("user:1"), true);
      assertEquals(userKeys.value.includes("user:2"), true);
    }
  });

  await t.step("should support bulk operations", async () => {
    const cache = new InMemoryCache<string>();
    
    const entries = new Map([
      ["bulk1", "value1"],
      ["bulk2", "value2"],
      ["bulk3", "value3"]
    ]);
    
    const msetResult = await cache.mset(entries);
    assertEquals(Result.isOk(msetResult), true);
    
    const mgetResult = await cache.mget(["bulk1", "bulk2", "bulk3", "missing"]);
    assertEquals(Result.isOk(mgetResult), true);
    if (Result.isOk(mgetResult)) {
      assertEquals(mgetResult.value.get("bulk1"), "value1");
      assertEquals(mgetResult.value.get("bulk2"), "value2");
      assertEquals(mgetResult.value.get("bulk3"), "value3");
      assertEquals(mgetResult.value.get("missing"), null);
    }
  });

  await t.step("should handle LRU eviction", async () => {
    const cache = new InMemoryCache<string>({ maxSize: 2 });
    
    await cache.set("key1", "value1");
    await cache.set("key2", "value2");
    
    // Access key1 to make it more recently used
    await cache.get("key1");
    
    // Adding key3 should evict key2 (least recently used)
    await cache.set("key3", "value3");
    
    const key1Result = await cache.get("key1");
    const key2Result = await cache.get("key2");
    const key3Result = await cache.get("key3");
    
    assertEquals(Result.isOk(key1Result), true);
    assertEquals(Result.isOk(key2Result), true);
    assertEquals(Result.isOk(key3Result), true);
    
    if (Result.isOk(key1Result) && Result.isOk(key2Result) && Result.isOk(key3Result)) {
      assertEquals(key1Result.value, "value1"); // Still exists
      assertEquals(key2Result.value, null); // Evicted
      assertEquals(key3Result.value, "value3"); // Newly added
    }
  });
});