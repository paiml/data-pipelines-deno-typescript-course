import {
  Converter,
  ConverterConfig,
  ConverterMetadata,
  ConversionError,
  ErrorCode,
  Result,
} from "../../shared/types/index.ts";
import { z } from "zod";
import { Decimal } from "decimal.js";

/**
 * EU VAT (Value Added Tax) schema
 */
export const EUVATSchema = z.object({
  amount: z.number().positive(),
  vatRate: z.number().min(0).max(100), // Percentage
  country: z.string(),
  isInclusive: z.boolean().optional().default(true), // VAT usually included in EU
  category: z.enum(["standard", "reduced", "zero", "exempt"]).optional(),
});

export type EUVAT = z.infer<typeof EUVATSchema>;

/**
 * USA Sales Tax schema
 */
export const USASalesTaxSchema = z.object({
  subtotal: z.number(),
  taxAmount: z.number(),
  total: z.number(),
  taxRate: z.number(), // Percentage
  state: z.string(),
  locality: z.string().optional(),
  stateTax: z.number(),
  localTax: z.number().optional(),
  originalVAT: z.object({
    amount: z.number(),
    rate: z.number(),
    country: z.string(),
  }),
});

export type USASalesTax = z.infer<typeof USASalesTaxSchema>;

/**
 * EU country VAT rates (2024)
 */
const EU_VAT_RATES: Record<string, number> = {
  "Germany": 19,
  "France": 20,
  "Italy": 22,
  "Spain": 21,
  "Netherlands": 21,
  "Belgium": 21,
  "Poland": 23,
  "Sweden": 25,
  "Denmark": 25,
  "Austria": 20,
  "Ireland": 23,
  "Portugal": 23,
  "Greece": 24,
  "Czech Republic": 21,
  "Finland": 24,
  "Luxembourg": 17,
  "Hungary": 27,
};

/**
 * US state sales tax rates (2024 averages including local)
 */
const US_SALES_TAX_RATES: Record<string, { state: number; avgLocal: number }> = {
  "AL": { state: 4.0, avgLocal: 5.24 },
  "AK": { state: 0.0, avgLocal: 1.76 },
  "AZ": { state: 5.6, avgLocal: 2.80 },
  "AR": { state: 6.5, avgLocal: 2.97 },
  "CA": { state: 7.25, avgLocal: 1.43 },
  "CO": { state: 2.9, avgLocal: 4.88 },
  "CT": { state: 6.35, avgLocal: 0.0 },
  "DE": { state: 0.0, avgLocal: 0.0 },
  "FL": { state: 6.0, avgLocal: 1.05 },
  "GA": { state: 4.0, avgLocal: 3.35 },
  "HI": { state: 4.0, avgLocal: 0.44 },
  "ID": { state: 6.0, avgLocal: 0.03 },
  "IL": { state: 6.25, avgLocal: 2.57 },
  "IN": { state: 7.0, avgLocal: 0.0 },
  "IA": { state: 6.0, avgLocal: 0.94 },
  "KS": { state: 6.5, avgLocal: 2.19 },
  "KY": { state: 6.0, avgLocal: 0.0 },
  "LA": { state: 4.45, avgLocal: 5.07 },
  "ME": { state: 5.5, avgLocal: 0.0 },
  "MD": { state: 6.0, avgLocal: 0.0 },
  "MA": { state: 6.25, avgLocal: 0.0 },
  "MI": { state: 6.0, avgLocal: 0.0 },
  "MN": { state: 6.875, avgLocal: 0.60 },
  "MS": { state: 7.0, avgLocal: 0.07 },
  "MO": { state: 4.225, avgLocal: 4.01 },
  "MT": { state: 0.0, avgLocal: 0.0 },
  "NE": { state: 5.5, avgLocal: 1.44 },
  "NV": { state: 6.85, avgLocal: 1.38 },
  "NH": { state: 0.0, avgLocal: 0.0 },
  "NJ": { state: 6.625, avgLocal: 0.0 },
  "NM": { state: 5.125, avgLocal: 2.70 },
  "NY": { state: 4.0, avgLocal: 4.53 },
  "NC": { state: 4.75, avgLocal: 2.22 },
  "ND": { state: 5.0, avgLocal: 1.96 },
  "OH": { state: 5.75, avgLocal: 1.48 },
  "OK": { state: 4.5, avgLocal: 4.45 },
  "OR": { state: 0.0, avgLocal: 0.0 },
  "PA": { state: 6.0, avgLocal: 0.34 },
  "RI": { state: 7.0, avgLocal: 0.0 },
  "SC": { state: 6.0, avgLocal: 1.46 },
  "SD": { state: 4.5, avgLocal: 1.9 },
  "TN": { state: 7.0, avgLocal: 2.55 },
  "TX": { state: 6.25, avgLocal: 1.95 },
  "UT": { state: 6.1, avgLocal: 1.09 },
  "VT": { state: 6.0, avgLocal: 0.24 },
  "VA": { state: 5.3, avgLocal: 0.45 },
  "WA": { state: 6.5, avgLocal: 2.73 },
  "WV": { state: 6.0, avgLocal: 0.52 },
  "WI": { state: 5.0, avgLocal: 0.46 },
  "WY": { state: 4.0, avgLocal: 1.34 },
  "DC": { state: 6.0, avgLocal: 0.0 },
};

/**
 * Map EU countries to comparable US states
 */
const EU_COUNTRY_TO_US_STATE: Record<string, string> = {
  "Germany": "TX",
  "France": "CA",
  "Italy": "NY",
  "Spain": "FL",
  "Netherlands": "MA",
  "Belgium": "DC",
  "Poland": "IL",
  "Sweden": "WA",
  "Denmark": "OR",
  "Austria": "CO",
  "Ireland": "MA",
  "Portugal": "RI",
  "Greece": "FL",
  "Czech Republic": "OH",
  "Finland": "MN",
  "Luxembourg": "DE",
  "Hungary": "NJ",
};

/**
 * Converts EU VAT to USA Sales Tax
 */
export class VatToSalesTaxConverter implements Converter<EUVAT, USASalesTax> {
  /**
   * Convert EU VAT to USA Sales Tax
   */
  async convert(
    input: EUVAT,
    config?: ConverterConfig,
  ): Promise<Result<USASalesTax, ConversionError>> {
    try {
      // Validate input if not skipped
      if (!config?.skipValidation && !this.validate(input)) {
        return Result.err(
          new ConversionError(
            "Invalid EU VAT format",
            ErrorCode.INVALID_INPUT,
            { input },
          ),
        );
      }

      // Get or use provided VAT rate
      const vatRate = input.vatRate ?? this.getVATRate(input.country);
      
      // Calculate base amount (excluding VAT)
      const baseAmount = this.calculateBaseAmount(input.amount, vatRate, input.isInclusive);
      
      // Map to US state
      const state = this.mapToUSState(input.country);
      
      // Get US tax rates
      const taxRates = this.getUSTaxRates(state);
      
      // Calculate US sales tax
      const stateTax = this.calculateTax(baseAmount, taxRates.state);
      const localTax = this.calculateTax(baseAmount, taxRates.avgLocal);
      const totalTax = stateTax.plus(localTax);
      const total = baseAmount.plus(totalTax);

      const result: USASalesTax = {
        subtotal: baseAmount.toNumber(),
        taxAmount: totalTax.toNumber(),
        total: total.toNumber(),
        taxRate: taxRates.state + taxRates.avgLocal,
        state,
        locality: taxRates.avgLocal > 0 ? "Average Local Rate" : undefined,
        stateTax: stateTax.toNumber(),
        localTax: taxRates.avgLocal > 0 ? localTax.toNumber() : undefined,
        originalVAT: {
          amount: input.amount,
          rate: vatRate,
          country: input.country,
        },
      };

      return Result.ok(result);
    } catch (error) {
      return Result.err(
        new ConversionError(
          `Tax conversion failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          ErrorCode.CONVERSION_FAILED,
          { input, error },
          false,
        ),
      );
    }
  }

  /**
   * Validate input is valid EU VAT
   */
  validate(input: unknown): input is EUVAT {
    const result = EUVATSchema.safeParse(input);
    return result.success;
  }

  /**
   * Get converter metadata
   */
  getMetadata(): ConverterMetadata {
    return {
      name: "VAT to Sales Tax Converter",
      version: "1.0.0",
      inputType: "EUVAT",
      outputType: "USASalesTax",
      description: "Converts EU VAT to USA Sales Tax calculations",
      performanceTarget: {
        p50: 5,
        p95: 10,
        p99: 15,
      },
    };
  }

  /**
   * Get VAT rate for country
   */
  private getVATRate(country: string): number {
    return EU_VAT_RATES[country] || 20; // Default to 20%
  }

  /**
   * Calculate base amount excluding tax
   */
  private calculateBaseAmount(
    amount: number,
    vatRate: number,
    isInclusive: boolean,
  ): Decimal {
    const amountDecimal = new Decimal(amount);
    
    if (isInclusive) {
      // Amount includes VAT, calculate base
      const divisor = new Decimal(1).plus(new Decimal(vatRate).div(100));
      return amountDecimal.div(divisor);
    } else {
      // Amount is already base
      return amountDecimal;
    }
  }

  /**
   * Map EU country to US state
   */
  private mapToUSState(country: string): string {
    return EU_COUNTRY_TO_US_STATE[country] || "NY";
  }

  /**
   * Get US tax rates for state
   */
  private getUSTaxRates(state: string): { state: number; avgLocal: number } {
    return US_SALES_TAX_RATES[state] || { state: 6.25, avgLocal: 1.0 };
  }

  /**
   * Calculate tax amount
   */
  private calculateTax(baseAmount: Decimal, rate: number): Decimal {
    return baseAmount.mul(new Decimal(rate).div(100));
  }

  /**
   * Calculate total with tax (convenience method)
   */
  calculateWithTax(subtotal: number, state: string): {
    subtotal: number;
    tax: number;
    total: number;
  } {
    const subtotalDecimal = new Decimal(subtotal);
    const rates = this.getUSTaxRates(state);
    const tax = this.calculateTax(subtotalDecimal, rates.state + rates.avgLocal);
    
    return {
      subtotal,
      tax: tax.toNumber(),
      total: subtotalDecimal.plus(tax).toNumber(),
    };
  }

  /**
   * Get all US state tax rates
   */
  getAllStateTaxRates(): Record<string, number> {
    const rates: Record<string, number> = {};
    
    for (const [state, tax] of Object.entries(US_SALES_TAX_RATES)) {
      rates[state] = tax.state + tax.avgLocal;
    }
    
    return rates;
  }
}