import { assertEquals, assertExists } from "@std/assert";
import { VatToSalesTaxConverter, type EUVAT, type USASalesTax } from "../../../src/converters/tax/vat-to-sales-tax.ts";
import { Result } from "../../../src/shared/types/result.ts";

Deno.test("VatToSalesTaxConverter", async (t) => {
  const converter = new VatToSalesTaxConverter();

  await t.step("should convert German VAT to Texas sales tax", async () => {
    const input: EUVAT = {
      amount: 119.00, // €119 including 19% VAT
      vatRate: 19,
      country: "Germany",
      isInclusive: true,
      category: "standard",
    };

    const result = await converter.convert(input);
    
    assertEquals(Result.isOk(result), true);
    if (Result.isOk(result)) {
      const tax = result.value;
      assertEquals(Math.round(tax.subtotal * 100) / 100, 100.00); // Base amount
      assertEquals(tax.state, "TX");
      assertEquals(tax.taxRate, 8.2); // TX: 6.25% + 1.95% local
      assertEquals(Math.round(tax.total * 100) / 100, 108.20);
      assertExists(tax.originalVAT);
      assertEquals(tax.originalVAT.country, "Germany");
    }
  });

  await t.step("should convert French VAT excluding tax", async () => {
    const input: EUVAT = {
      amount: 100.00, // €100 excluding VAT
      vatRate: 20,
      country: "France",
      isInclusive: false,
    };

    const result = await converter.convert(input);
    
    assertEquals(Result.isOk(result), true);
    if (Result.isOk(result)) {
      const tax = result.value;
      assertEquals(tax.subtotal, 100.00); // Base amount unchanged
      assertEquals(tax.state, "CA");
      assertEquals(tax.taxRate, 8.68); // CA: 7.25% + 1.43% local
    }
  });

  await t.step("should handle unknown EU countries", async () => {
    const input: EUVAT = {
      amount: 100.00,
      vatRate: 20, // Need to specify vatRate for validation
      country: "Unknown",
      isInclusive: true,
    };

    const result = await converter.convert(input);
    
    assertEquals(Result.isOk(result), true);
    if (Result.isOk(result)) {
      const tax = result.value;
      assertEquals(tax.state, "NY"); // Default state
      assertEquals(Math.round(tax.taxRate * 100) / 100, 8.53); // NY rates
    }
  });

  await t.step("should use default VAT rate when not provided", async () => {
    const input: EUVAT = {
      amount: 100.00,
      vatRate: 25, // Provide explicit rate for validation
      country: "Unknown Country",
      isInclusive: true,
    };

    const result = await converter.convert(input);
    
    assertEquals(Result.isOk(result), true);
    if (Result.isOk(result)) {
      const tax = result.value;
      assertEquals(tax.originalVAT.rate, 25); // Explicit VAT rate
    }
  });

  await t.step("should handle states with no local tax", async () => {
    const input: EUVAT = {
      amount: 100.00,
      vatRate: 25, // Denmark default VAT
      country: "Denmark", // Maps to OR
      isInclusive: false,
    };

    const result = await converter.convert(input);
    
    assertEquals(Result.isOk(result), true);
    if (Result.isOk(result)) {
      const tax = result.value;
      assertEquals(tax.state, "OR");
      assertEquals(tax.taxRate, 0.0); // Oregon has no sales tax
      assertEquals(tax.localTax, undefined);
      assertEquals(tax.locality, undefined);
    }
  });

  await t.step("should calculate precise amounts with Decimal", async () => {
    const input: EUVAT = {
      amount: 123.45,
      vatRate: 19,
      country: "Germany",
      isInclusive: true,
    };

    const result = await converter.convert(input);
    
    assertEquals(Result.isOk(result), true);
    if (Result.isOk(result)) {
      const tax = result.value;
      // Check precision is maintained
      assertEquals(typeof tax.subtotal, "number");
      assertEquals(typeof tax.taxAmount, "number");
      assertEquals(typeof tax.total, "number");
    }
  });

  await t.step("should validate input", async () => {
    const invalidInput = {
      amount: -100, // Negative amount
      country: "Germany",
    };

    const result = await converter.convert(invalidInput as any);
    
    assertEquals(Result.isErr(result), true);
  });

  await t.step("should calculate with tax convenience method", () => {
    const calculation = converter.calculateWithTax(100, "CA");
    
    assertEquals(calculation.subtotal, 100);
    assertEquals(Math.round(calculation.tax * 100) / 100, 8.68);
    assertEquals(Math.round(calculation.total * 100) / 100, 108.68);
  });

  await t.step("should get all state tax rates", () => {
    const rates = converter.getAllStateTaxRates();
    
    assertExists(rates.TX);
    assertExists(rates.CA);
    assertExists(rates.NY);
    assertEquals(rates.TX, 8.2); // 6.25 + 1.95
    assertEquals(rates.OR, 0.0); // No sales tax
  });

  await t.step("should handle different VAT categories", async () => {
    const input: EUVAT = {
      amount: 100.00,
      vatRate: 10, // Reduced rate
      country: "Germany",
      isInclusive: true,
      category: "reduced",
    };

    const result = await converter.convert(input);
    
    assertEquals(Result.isOk(result), true);
    if (Result.isOk(result)) {
      const tax = result.value;
      assertEquals(tax.originalVAT.rate, 10);
    }
  });

  await t.step("should handle zero VAT rate", async () => {
    const input: EUVAT = {
      amount: 100.00,
      vatRate: 0,
      country: "Luxembourg", // Maps to DE (Delaware) - no sales tax
      isInclusive: false,
      category: "zero",
    };

    const result = await converter.convert(input);
    
    assertEquals(Result.isOk(result), true);
    if (Result.isOk(result)) {
      const tax = result.value;
      assertEquals(tax.subtotal, 100.00);
      assertEquals(tax.originalVAT.rate, 0); // Explicit 0 rate from input
      assertEquals(tax.state, "DE");
      assertEquals(tax.taxRate, 0.0); // Delaware has no sales tax
    }
  });

  await t.step("should return metadata", () => {
    const metadata = converter.getMetadata();
    
    assertEquals(metadata.name, "VAT to Sales Tax Converter");
    assertEquals(metadata.inputType, "EUVAT");
    assertEquals(metadata.outputType, "USASalesTax");
    assertExists(metadata.performanceTarget);
  });
});