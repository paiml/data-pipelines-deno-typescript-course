import { assertEquals, assertExists } from "@std/testing";
import { EurToUsdConverter } from "./eur-to-usd.ts";
import type { EURAmount } from "./types.ts";

Deno.test("EurToUsdConverter", async (t) => {
  const converter = new EurToUsdConverter();

  await t.step("should convert valid EUR amount to USD", async () => {
    const input: EURAmount = {
      amount: 100,
      currency: "EUR",
      precision: 2,
    };

    const result = await converter.convert(input);
    
    assertEquals(result.success, true);
    if (result.success) {
      assertEquals(result.value.currency, "USD");
      assertEquals(typeof result.value.amount, "number");
      assertExists(result.value.exchangeRate);
      assertExists(result.value.timestamp);
      // Check amount is reasonable (100 EUR should be roughly 100-120 USD)
      assertEquals(result.value.amount > 100 && result.value.amount < 120, true);
    }
  });

  await t.step("should handle zero amount", async () => {
    const input: EURAmount = {
      amount: 0,
      currency: "EUR",
    };

    const result = await converter.convert(input);
    
    assertEquals(result.success, true);
    if (result.success) {
      assertEquals(result.value.amount, 0);
      assertEquals(result.value.currency, "USD");
    }
  });

  await t.step("should handle negative amounts", async () => {
    const input: EURAmount = {
      amount: -50,
      currency: "EUR",
    };

    const result = await converter.convert(input);
    
    assertEquals(result.success, true);
    if (result.success) {
      assertEquals(result.value.amount < 0, true);
    }
  });

  await t.step("should respect precision setting", async () => {
    const input: EURAmount = {
      amount: 123.456789,
      currency: "EUR",
      precision: 4,
    };

    const result = await converter.convert(input);
    
    assertEquals(result.success, true);
    if (result.success) {
      const decimalPlaces = result.value.amount.toString().split('.')[1]?.length || 0;
      assertEquals(decimalPlaces <= 4, true);
      assertEquals(result.value.precision, 4);
    }
  });

  await t.step("should validate input format", () => {
    const valid = converter.validate({
      amount: 100,
      currency: "EUR",
    });
    assertEquals(valid, true);

    const invalid = converter.validate({
      amount: "100", // Wrong type
      currency: "EUR",
    });
    assertEquals(invalid, false);

    const wrongCurrency = converter.validate({
      amount: 100,
      currency: "USD", // Wrong currency
    });
    assertEquals(wrongCurrency, false);
  });

  await t.step("should handle invalid input", async () => {
    const result = await converter.convert({
      amount: "invalid",
      currency: "EUR",
    } as any);
    
    assertEquals(result.success, false);
    if (!result.success) {
      assertEquals(result.error.code, "INVALID_INPUT");
    }
  });

  await t.step("should use cache for repeated conversions", async () => {
    const input: EURAmount = {
      amount: 100,
      currency: "EUR",
    };

    // Clear cache first
    converter.clearCache();
    assertEquals(converter.getCacheSize(), 0);

    // First conversion - should populate cache
    const result1 = await converter.convert(input);
    assertEquals(converter.getCacheSize(), 1);

    // Second conversion - should use cache
    const result2 = await converter.convert(input);
    assertEquals(converter.getCacheSize(), 1);

    // Both results should have same exchange rate (from cache)
    if (result1.success && result2.success) {
      assertEquals(result1.value.exchangeRate, result2.value.exchangeRate);
    }
  });

  await t.step("should skip cache when configured", async () => {
    const input: EURAmount = {
      amount: 100,
      currency: "EUR",
    };

    const result1 = await converter.convert(input);
    const result2 = await converter.convert(input, { useCache: false });

    // Rates might be different when not using cache
    if (result1.success && result2.success) {
      // Timestamps should be different
      assertEquals(
        result1.value.timestamp.getTime() !== result2.value.timestamp.getTime(),
        true
      );
    }
  });

  await t.step("should skip validation when configured", async () => {
    const partialInput = {
      amount: 100,
      currency: "EUR",
    } as EURAmount;

    const result = await converter.convert(partialInput, { 
      skipValidation: true 
    });
    
    assertEquals(result.success, true);
  });

  await t.step("should provide correct metadata", () => {
    const metadata = converter.getMetadata();
    
    assertEquals(metadata.name, "EUR to USD Converter");
    assertEquals(metadata.inputType, "EURAmount");
    assertEquals(metadata.outputType, "USDAmount");
    assertExists(metadata.performanceTarget);
    assertEquals(metadata.performanceTarget.p99, 10);
  });

  await t.step("should handle very large amounts", async () => {
    const input: EURAmount = {
      amount: 1_000_000_000,
      currency: "EUR",
    };

    const result = await converter.convert(input);
    
    assertEquals(result.success, true);
    if (result.success) {
      assertEquals(result.value.amount > 1_000_000_000, true);
    }
  });

  await t.step("should handle very small amounts with precision", async () => {
    const input: EURAmount = {
      amount: 0.001,
      currency: "EUR",
      precision: 6,
    };

    const result = await converter.convert(input);
    
    assertEquals(result.success, true);
    if (result.success) {
      assertEquals(result.value.amount > 0, true);
      assertEquals(result.value.precision, 6);
    }
  });
});