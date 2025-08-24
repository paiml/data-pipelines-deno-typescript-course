import {
  Converter,
  ConverterConfig,
  ConverterMetadata,
  ConversionError,
  ErrorCode,
  Result,
} from "../../shared/types/index.ts";
import { z } from "zod";

/**
 * EU date format schema (DD/MM/YYYY or DD-MM-YYYY)
 */
export const EUDateSchema = z.object({
  date: z.string().regex(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/),
  separator: z.enum(["/", "-"]).optional(),
});

export type EUDate = z.infer<typeof EUDateSchema>;

/**
 * USA date format schema (MM/DD/YYYY)
 */
export const USADateSchema = z.object({
  date: z.string(),
  originalDate: z.string(),
  day: z.number(),
  month: z.number(),
  year: z.number(),
  isValid: z.boolean(),
});

export type USADate = z.infer<typeof USADateSchema>;

/**
 * Converts EU date format (DD/MM/YYYY) to USA format (MM/DD/YYYY)
 */
export class EuToUsaDateConverter implements Converter<EUDate, USADate> {
  /**
   * Convert EU date format to USA format
   */
  async convert(
    input: EUDate,
    config?: ConverterConfig,
  ): Promise<Result<USADate, ConversionError>> {
    try {
      // Validate input if not skipped
      if (!config?.skipValidation && !this.validate(input)) {
        return Result.err(
          new ConversionError(
            "Invalid EU date format",
            ErrorCode.INVALID_INPUT,
            { input },
          ),
        );
      }

      // Detect separator
      const separator = input.separator || this.detectSeparator(input.date);
      
      // Parse date components
      const parts = input.date.split(separator);
      if (parts.length !== 3) {
        return Result.err(
          new ConversionError(
            "Invalid date format: expected DD/MM/YYYY or DD-MM-YYYY",
            ErrorCode.INVALID_INPUT,
            { input },
          ),
        );
      }

      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);

      // Validate date components
      const validationError = this.validateDateComponents(day, month, year);
      if (validationError) {
        return Result.err(validationError);
      }

      // Check if date is valid (handle leap years, etc.)
      const isValid = this.isValidDate(day, month, year);

      // Format as USA date (MM/DD/YYYY)
      const usaDate = `${month.toString().padStart(2, "0")}/${day.toString().padStart(2, "0")}/${year}`;

      const result: USADate = {
        date: usaDate,
        originalDate: input.date,
        day,
        month,
        year,
        isValid,
      };

      return Result.ok(result);
    } catch (error) {
      return Result.err(
        new ConversionError(
          `Date conversion failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          ErrorCode.CONVERSION_FAILED,
          { input, error },
          false,
        ),
      );
    }
  }

  /**
   * Validate input is a valid EU date format
   */
  validate(input: unknown): input is EUDate {
    const result = EUDateSchema.safeParse(input);
    return result.success;
  }

  /**
   * Get converter metadata
   */
  getMetadata(): ConverterMetadata {
    return {
      name: "EU to USA Date Converter",
      version: "1.0.0",
      inputType: "EUDate",
      outputType: "USADate",
      description: "Converts EU date format (DD/MM/YYYY) to USA format (MM/DD/YYYY)",
      performanceTarget: {
        p50: 3,
        p95: 5,
        p99: 8,
      },
    };
  }

  /**
   * Detect the separator used in the date string
   */
  private detectSeparator(date: string): "/" | "-" {
    return date.includes("/") ? "/" : "-";
  }

  /**
   * Validate date components
   */
  private validateDateComponents(
    day: number,
    month: number,
    year: number,
  ): ConversionError | null {
    if (month < 1 || month > 12) {
      return new ConversionError(
        `Invalid month: ${month}`,
        ErrorCode.OUT_OF_RANGE,
        { month },
      );
    }

    if (day < 1 || day > 31) {
      return new ConversionError(
        `Invalid day: ${day}`,
        ErrorCode.OUT_OF_RANGE,
        { day },
      );
    }

    if (year < 1900 || year > 2100) {
      return new ConversionError(
        `Year out of range: ${year}`,
        ErrorCode.OUT_OF_RANGE,
        { year },
      );
    }

    return null;
  }

  /**
   * Check if a date is valid (considering leap years, month lengths, etc.)
   */
  private isValidDate(day: number, month: number, year: number): boolean {
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    
    // Check for leap year
    if (this.isLeapYear(year)) {
      daysInMonth[1] = 29;
    }

    if (day > daysInMonth[month - 1]) {
      return false;
    }

    return true;
  }

  /**
   * Check if a year is a leap year
   */
  private isLeapYear(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  }

  /**
   * Parse EU date string to components
   */
  parseEuDate(dateStr: string): { day: number; month: number; year: number } | null {
    const separator = this.detectSeparator(dateStr);
    const parts = dateStr.split(separator);
    
    if (parts.length !== 3) {
      return null;
    }

    return {
      day: parseInt(parts[0], 10),
      month: parseInt(parts[1], 10),
      year: parseInt(parts[2], 10),
    };
  }

  /**
   * Format date components to USA format
   */
  formatUsaDate(day: number, month: number, year: number): string {
    return `${month.toString().padStart(2, "0")}/${day.toString().padStart(2, "0")}/${year}`;
  }
}