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
 * EU number format schema (1.234.567,89)
 */
export const EUNumberSchema = z.object({
  value: z.string().regex(/^-?\d{1,3}(\.\d{3})*(\,\d+)?$/),
  precision: z.number().int().min(0).max(10).optional(),
});

export type EUNumber = z.infer<typeof EUNumberSchema>;

/**
 * USA number format schema (1,234,567.89)
 */
export const USANumberSchema = z.object({
  value: z.string(),
  numericValue: z.number(),
  originalValue: z.string(),
  precision: z.number(),
});

export type USANumber = z.infer<typeof USANumberSchema>;

/**
 * Converts EU number format (1.234,56) to USA format (1,234.56)
 */
export class EuToUsaNumberConverter implements Converter<EUNumber, USANumber> {
  /**
   * Convert EU number format to USA format
   */
  async convert(
    input: EUNumber,
    config?: ConverterConfig,
  ): Promise<Result<USANumber, ConversionError>> {
    try {
      // Validate input if not skipped
      if (!config?.skipValidation && !this.validate(input)) {
        return Result.err(
          new ConversionError(
            "Invalid EU number format",
            ErrorCode.INVALID_INPUT,
            { input },
          ),
        );
      }

      // Parse EU number to numeric value
      const numericValue = this.parseEuNumber(input.value);
      
      if (numericValue === null) {
        return Result.err(
          new ConversionError(
            "Failed to parse EU number",
            ErrorCode.CONVERSION_FAILED,
            { input },
          ),
        );
      }

      // Determine precision
      const precision = input.precision ?? this.detectPrecision(input.value);

      // Format as USA number
      const usaFormatted = this.formatUsaNumber(numericValue, precision);

      const result: USANumber = {
        value: usaFormatted,
        numericValue,
        originalValue: input.value,
        precision,
      };

      return Result.ok(result);
    } catch (error) {
      return Result.err(
        new ConversionError(
          `Number format conversion failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          ErrorCode.CONVERSION_FAILED,
          { input, error },
          false,
        ),
      );
    }
  }

  /**
   * Validate input is a valid EU number format
   */
  validate(input: unknown): input is EUNumber {
    if (typeof input !== "object" || input === null) {
      return false;
    }

    const obj = input as any;
    
    // Check if value is string and matches EU format
    if (typeof obj.value !== "string") {
      return false;
    }

    // EU format: thousands separator is dot, decimal separator is comma
    // Examples: 1.234,56 or 1.234.567,89 or 1234,5
    const euPattern = /^-?\d{1,3}(\.\d{3})*(\,\d+)?$|^-?\d+(\,\d+)?$/;
    
    return euPattern.test(obj.value);
  }

  /**
   * Get converter metadata
   */
  getMetadata(): ConverterMetadata {
    return {
      name: "EU to USA Number Format Converter",
      version: "1.0.0",
      inputType: "EUNumber",
      outputType: "USANumber",
      description: "Converts EU number format (1.234,56) to USA format (1,234.56)",
      performanceTarget: {
        p50: 1,
        p95: 2,
        p99: 3,
      },
    };
  }

  /**
   * Parse EU number string to numeric value
   */
  private parseEuNumber(euNumber: string): number | null {
    try {
      // Remove thousand separators (dots) and replace decimal comma with dot
      const normalized = euNumber
        .replace(/\./g, "")  // Remove thousand separators
        .replace(",", ".");   // Replace decimal comma with dot

      const decimal = new Decimal(normalized);
      return decimal.toNumber();
    } catch {
      return null;
    }
  }

  /**
   * Detect precision from EU number string
   */
  private detectPrecision(euNumber: string): number {
    const parts = euNumber.split(",");
    if (parts.length === 2) {
      return parts[1].length;
    }
    return 0;
  }

  /**
   * Format number to USA format
   */
  private formatUsaNumber(value: number, precision: number): string {
    // Use Decimal for precise formatting
    const decimal = new Decimal(value);
    const rounded = decimal.toDecimalPlaces(precision, Decimal.ROUND_HALF_UP);
    
    // Convert to string with fixed precision
    let str = rounded.toFixed(precision);
    
    // Split into integer and decimal parts
    const parts = str.split(".");
    
    // Add thousand separators to integer part
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    
    // Join back together
    return parts.join(".");
  }

  /**
   * Convert EU number string directly (convenience method)
   */
  convertString(euNumber: string): string | null {
    const numericValue = this.parseEuNumber(euNumber);
    if (numericValue === null) {
      return null;
    }
    
    const precision = this.detectPrecision(euNumber);
    return this.formatUsaNumber(numericValue, precision);
  }

  /**
   * Parse and return numeric value (convenience method)
   */
  toNumber(euNumber: string): number | null {
    return this.parseEuNumber(euNumber);
  }
}