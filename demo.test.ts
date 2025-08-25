/**
 * Test file for demo.ts
 * Demonstrates Deno's testing capabilities
 */

import { assertEquals } from "@std/testing";
import { convertCurrency, SimpleConverter } from "./demo.ts";

Deno.test("SimpleConverter - converts EUR to USD correctly", () => {
  const converter = new SimpleConverter();

  assertEquals(converter.convert(100), 109);
  assertEquals(converter.convert(50), 54.5);
  assertEquals(converter.convert(0), 0);
});

Deno.test("convertCurrency - formats output correctly", () => {
  assertEquals(convertCurrency(100), "€100 = $109");
  assertEquals(convertCurrency(50), "€50 = $54.5");
  assertEquals(convertCurrency(1), "€1 = $1.09");
});

Deno.test("SimpleConverter - handles decimals", () => {
  const converter = new SimpleConverter();

  // Should round to 2 decimal places
  assertEquals(converter.convert(10.99), 11.98);
  assertEquals(converter.convert(99.99), 108.99);
});
