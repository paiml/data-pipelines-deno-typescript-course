/**
 * Benchmark file for demo.ts
 * Demonstrates Deno's benchmarking capabilities
 */

import { SimpleConverter } from "./demo.ts";

const converter = new SimpleConverter();

Deno.bench("EUR to USD conversion - single value", () => {
  converter.convert(100);
});

Deno.bench("EUR to USD conversion - multiple values", () => {
  for (let i = 0; i < 100; i++) {
    converter.convert(i);
  }
});

Deno.bench("EUR to USD conversion - large value", () => {
  converter.convert(1_000_000);
});
