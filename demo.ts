/**
 * Demo file for Deno tooling commands
 * This file is guaranteed to work with all Deno commands
 */

// Simple converter example
export interface Converter {
  name: string;
  convert(value: number): number;
}

export class SimpleConverter implements Converter {
  name = "Simple EUR to USD Converter";

  convert(eurAmount: number): number {
    const exchangeRate = 1.09; // Fixed rate for demo
    return Math.round(eurAmount * exchangeRate * 100) / 100;
  }
}

// Demo function
export function convertCurrency(amount: number): string {
  const converter = new SimpleConverter();
  const result = converter.convert(amount);
  return `€${amount} = $${result}`;
}

// Test the converter
if (import.meta.main) {
  console.log("🚀 Deno Tools Demo");
  console.log("-".repeat(40));

  const testAmounts = [10, 50, 100, 250.50];

  for (const amount of testAmounts) {
    console.log(convertCurrency(amount));
  }

  console.log("-".repeat(40));
  console.log("✅ Demo completed successfully!");
}
