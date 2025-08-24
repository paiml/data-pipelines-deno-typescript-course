import { assertEquals, assertAlmostEquals } from "@std/testing";
import { MetricToImperialConverter } from "./metric-to-imperial.ts";
import { MetricUnit, ImperialUnit } from "./types.ts";
import type { MetricMeasurement } from "./types.ts";

Deno.test("MetricToImperialConverter", async (t) => {
  const converter = new MetricToImperialConverter();

  await t.step("should convert meters to feet", async () => {
    const input: MetricMeasurement = {
      value: 1,
      unit: MetricUnit.METER,
      precision: 2,
    };

    const result = await converter.convert(input);
    
    assertEquals(result.success, true);
    if (result.success) {
      assertEquals(result.value.unit, ImperialUnit.FOOT);
      assertAlmostEquals(result.value.value, 3.28, 0.01);
      assertEquals(result.value.originalUnit, MetricUnit.METER);
      assertEquals(result.value.originalValue, 1);
    }
  });

  await t.step("should convert kilometers to miles", async () => {
    const input: MetricMeasurement = {
      value: 10,
      unit: MetricUnit.KILOMETER,
      precision: 2,
    };

    const result = await converter.convert(input);
    
    assertEquals(result.success, true);
    if (result.success) {
      assertEquals(result.value.unit, ImperialUnit.MILE);
      assertAlmostEquals(result.value.value, 6.21, 0.01);
    }
  });

  await t.step("should convert Celsius to Fahrenheit", async () => {
    const input: MetricMeasurement = {
      value: 0,
      unit: MetricUnit.CELSIUS,
      precision: 1,
    };

    const result = await converter.convert(input);
    
    assertEquals(result.success, true);
    if (result.success) {
      assertEquals(result.value.unit, ImperialUnit.FAHRENHEIT);
      assertEquals(result.value.value, 32);
    }
  });

  await t.step("should convert 100°C to 212°F", async () => {
    const input: MetricMeasurement = {
      value: 100,
      unit: MetricUnit.CELSIUS,
      precision: 1,
    };

    const result = await converter.convert(input);
    
    assertEquals(result.success, true);
    if (result.success) {
      assertEquals(result.value.value, 212);
    }
  });

  await t.step("should convert negative temperatures", async () => {
    const input: MetricMeasurement = {
      value: -40,
      unit: MetricUnit.CELSIUS,
      precision: 1,
    };

    const result = await converter.convert(input);
    
    assertEquals(result.success, true);
    if (result.success) {
      assertEquals(result.value.value, -40); // -40°C = -40°F
    }
  });

  await t.step("should convert kilograms to pounds", async () => {
    const input: MetricMeasurement = {
      value: 100,
      unit: MetricUnit.KILOGRAM,
      precision: 2,
    };

    const result = await converter.convert(input);
    
    assertEquals(result.success, true);
    if (result.success) {
      assertEquals(result.value.unit, ImperialUnit.POUND);
      assertAlmostEquals(result.value.value, 220.46, 0.01);
    }
  });

  await t.step("should convert grams to ounces", async () => {
    const input: MetricMeasurement = {
      value: 100,
      unit: MetricUnit.GRAM,
      precision: 3,
    };

    const result = await converter.convert(input);
    
    assertEquals(result.success, true);
    if (result.success) {
      assertEquals(result.value.unit, ImperialUnit.OUNCE);
      assertAlmostEquals(result.value.value, 3.527, 0.001);
    }
  });

  await t.step("should convert liters to gallons", async () => {
    const input: MetricMeasurement = {
      value: 10,
      unit: MetricUnit.LITER,
      precision: 3,
    };

    const result = await converter.convert(input);
    
    assertEquals(result.success, true);
    if (result.success) {
      assertEquals(result.value.unit, ImperialUnit.GALLON);
      assertAlmostEquals(result.value.value, 2.642, 0.001);
    }
  });

  await t.step("should convert milliliters to fluid ounces", async () => {
    const input: MetricMeasurement = {
      value: 100,
      unit: MetricUnit.MILLILITER,
      precision: 2,
    };

    const result = await converter.convert(input);
    
    assertEquals(result.success, true);
    if (result.success) {
      assertEquals(result.value.unit, ImperialUnit.FLUID_OUNCE);
      assertAlmostEquals(result.value.value, 3.38, 0.01);
    }
  });

  await t.step("should handle zero values", async () => {
    const input: MetricMeasurement = {
      value: 0,
      unit: MetricUnit.METER,
    };

    const result = await converter.convert(input);
    
    assertEquals(result.success, true);
    if (result.success) {
      assertEquals(result.value.value, 0);
    }
  });

  await t.step("should respect precision settings", async () => {
    const input: MetricMeasurement = {
      value: 1.23456789,
      unit: MetricUnit.METER,
      precision: 5,
    };

    const result = await converter.convert(input);
    
    assertEquals(result.success, true);
    if (result.success) {
      const decimalPlaces = result.value.value.toString().split('.')[1]?.length || 0;
      assertEquals(decimalPlaces <= 5, true);
      assertEquals(result.value.precision, 5);
    }
  });

  await t.step("should validate input format", () => {
    const valid = converter.validate({
      value: 10,
      unit: MetricUnit.METER,
    });
    assertEquals(valid, true);

    const invalid = converter.validate({
      value: "10", // Wrong type
      unit: MetricUnit.METER,
    });
    assertEquals(invalid, false);

    const invalidUnit = converter.validate({
      value: 10,
      unit: "invalid", // Invalid unit
    });
    assertEquals(invalidUnit, false);
  });

  await t.step("should handle invalid input", async () => {
    const result = await converter.convert({
      value: "invalid",
      unit: MetricUnit.METER,
    } as any);
    
    assertEquals(result.success, false);
    if (!result.success) {
      assertEquals(result.error.code, "INVALID_INPUT");
    }
  });

  await t.step("should provide correct metadata", () => {
    const metadata = converter.getMetadata();
    
    assertEquals(metadata.name, "Metric to Imperial Converter");
    assertEquals(metadata.inputType, "MetricMeasurement");
    assertEquals(metadata.outputType, "ImperialMeasurement");
    assertEquals(metadata.performanceTarget.p99, 5);
  });

  await t.step("convenience methods should work correctly", () => {
    // Temperature
    assertEquals(converter.celsiusToFahrenheit(0), 32);
    assertEquals(converter.celsiusToFahrenheit(100), 212);
    
    // Length
    assertAlmostEquals(converter.metersToFeet(1), 3.28084, 0.00001);
    assertAlmostEquals(converter.kilometersToMiles(1), 0.621371, 0.000001);
    
    // Weight
    assertAlmostEquals(converter.kilogramsToPounds(1), 2.20462, 0.00001);
    
    // Volume
    assertAlmostEquals(converter.litersToGallons(1), 0.264172, 0.000001);
  });

  await t.step("should handle very small values with precision", async () => {
    const input: MetricMeasurement = {
      value: 0.001,
      unit: MetricUnit.KILOMETER,
      precision: 6,
    };

    const result = await converter.convert(input);
    
    assertEquals(result.success, true);
    if (result.success) {
      assertAlmostEquals(result.value.value, 0.000621, 0.000001);
    }
  });

  await t.step("should handle very large values", async () => {
    const input: MetricMeasurement = {
      value: 1000000,
      unit: MetricUnit.METER,
      precision: 0,
    };

    const result = await converter.convert(input);
    
    assertEquals(result.success, true);
    if (result.success) {
      assertEquals(result.value.value > 3000000, true);
    }
  });
});