import { EurToUsdConverter } from "./eur-to-usd.ts";
import type { EURAmount } from "./types.ts";

const converter = new EurToUsdConverter();

const testInput: EURAmount = {
  amount: 100,
  currency: "EUR",
  precision: 2,
};

Deno.bench("EUR to USD conversion - cold cache", async () => {
  converter.clearCache();
  await converter.convert(testInput);
});

Deno.bench("EUR to USD conversion - warm cache", async () => {
  await converter.convert(testInput);
});

Deno.bench("EUR to USD conversion - no cache", async () => {
  await converter.convert(testInput, { useCache: false });
});

Deno.bench("EUR to USD validation only", () => {
  converter.validate(testInput);
});

Deno.bench("EUR to USD conversion - batch 100", async () => {
  const promises = Array.from({ length: 100 }, (_, i) => 
    converter.convert({
      amount: i + 1,
      currency: "EUR",
      precision: 2,
    })
  );
  await Promise.all(promises);
});

Deno.bench("EUR to USD conversion - high precision", async () => {
  await converter.convert({
    amount: 123.456789,
    currency: "EUR",
    precision: 8,
  });
});