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
 * EU phone number format schema
 */
export const EUPhoneSchema = z.object({
  countryCode: z.string(),
  number: z.string(),
  extension: z.string().optional(),
  type: z.enum(["mobile", "landline", "voip"]).optional(),
});

export type EUPhone = z.infer<typeof EUPhoneSchema>;

/**
 * USA phone number format schema
 */
export const USAPhoneSchema = z.object({
  countryCode: z.string(),
  areaCode: z.string(),
  exchangeCode: z.string(),
  lineNumber: z.string(),
  extension: z.string().optional(),
  formatted: z.string(),
  e164: z.string(),
  type: z.enum(["mobile", "landline", "voip"]).optional(),
});

export type USAPhone = z.infer<typeof USAPhoneSchema>;

/**
 * EU country codes to US area codes mapping (for demonstration)
 */
const EU_COUNTRY_CODE_TO_US_AREA: Record<string, string> = {
  "44": "212",  // UK → New York
  "33": "310",  // France → Los Angeles
  "49": "312",  // Germany → Chicago
  "39": "305",  // Italy → Miami
  "34": "415",  // Spain → San Francisco
  "31": "617",  // Netherlands → Boston
  "32": "202",  // Belgium → Washington DC
  "48": "773",  // Poland → Chicago
  "46": "206",  // Sweden → Seattle
  "45": "503",  // Denmark → Portland
  "43": "303",  // Austria → Denver
  "353": "617", // Ireland → Boston
  "351": "401", // Portugal → Rhode Island
  "30": "305",  // Greece → Miami
  "420": "216", // Czech Republic → Cleveland
  "358": "612", // Finland → Minneapolis
};

/**
 * Converts EU phone numbers to USA format
 */
export class EuToUsaPhoneConverter implements Converter<EUPhone, USAPhone> {
  /**
   * Convert EU phone to USA format
   */
  async convert(
    input: EUPhone,
    config?: ConverterConfig,
  ): Promise<Result<USAPhone, ConversionError>> {
    try {
      // Validate input if not skipped
      if (!config?.skipValidation && !this.validate(input)) {
        return Result.err(
          new ConversionError(
            "Invalid EU phone format",
            ErrorCode.INVALID_INPUT,
            { input },
          ),
        );
      }

      // Clean the phone number
      const cleanedNumber = this.cleanPhoneNumber(input.number);
      
      // Map to US area code based on country
      const areaCode = this.mapToUSAreaCode(input.countryCode);
      
      // Extract or generate exchange and line numbers
      const { exchangeCode, lineNumber } = this.extractUSPhoneComponents(cleanedNumber);
      
      // Format the phone number
      const formatted = this.formatUSPhone(areaCode, exchangeCode, lineNumber, input.extension);
      const e164 = this.formatE164(areaCode, exchangeCode, lineNumber);

      const result: USAPhone = {
        countryCode: "+1",
        areaCode,
        exchangeCode,
        lineNumber,
        extension: input.extension,
        formatted,
        e164,
        type: input.type,
      };

      return Result.ok(result);
    } catch (error) {
      return Result.err(
        new ConversionError(
          `Phone conversion failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          ErrorCode.CONVERSION_FAILED,
          { input, error },
          false,
        ),
      );
    }
  }

  /**
   * Validate input is a valid EU phone
   */
  validate(input: unknown): input is EUPhone {
    const result = EUPhoneSchema.safeParse(input);
    return result.success;
  }

  /**
   * Get converter metadata
   */
  getMetadata(): ConverterMetadata {
    return {
      name: "EU to USA Phone Converter",
      version: "1.0.0",
      inputType: "EUPhone",
      outputType: "USAPhone",
      description: "Converts EU phone numbers to USA format",
      performanceTarget: {
        p50: 5,
        p95: 10,
        p99: 20,
      },
    };
  }

  /**
   * Clean phone number by removing non-digits
   */
  private cleanPhoneNumber(number: string): string {
    return number.replace(/\D/g, "");
  }

  /**
   * Map EU country code to US area code
   */
  private mapToUSAreaCode(countryCode: string): string {
    // Remove + if present
    const code = countryCode.replace("+", "");
    
    const areaCode = EU_COUNTRY_CODE_TO_US_AREA[code];
    if (areaCode) {
      return areaCode;
    }
    
    // Default to New York area code
    return "212";
  }

  /**
   * Extract US phone components from cleaned number
   */
  private extractUSPhoneComponents(cleanedNumber: string): {
    exchangeCode: string;
    lineNumber: string;
  } {
    // Ensure we have at least 7 digits for a US phone number
    let paddedNumber = cleanedNumber;
    
    if (paddedNumber.length < 7) {
      // Pad with random digits for demo
      paddedNumber = paddedNumber.padEnd(7, "5");
    }
    
    // Take last 7 digits for exchange and line number
    const last7 = paddedNumber.slice(-7);
    
    return {
      exchangeCode: last7.substring(0, 3),
      lineNumber: last7.substring(3, 7),
    };
  }

  /**
   * Format US phone number
   */
  private formatUSPhone(
    areaCode: string,
    exchangeCode: string,
    lineNumber: string,
    extension?: string,
  ): string {
    let formatted = `(${areaCode}) ${exchangeCode}-${lineNumber}`;
    
    if (extension) {
      formatted += ` ext. ${extension}`;
    }
    
    return formatted;
  }

  /**
   * Format as E.164
   */
  private formatE164(
    areaCode: string,
    exchangeCode: string,
    lineNumber: string,
  ): string {
    return `+1${areaCode}${exchangeCode}${lineNumber}`;
  }

  /**
   * Parse EU phone string (convenience method)
   */
  parseEUPhone(phoneString: string): EUPhone | null {
    // Match common EU phone formats
    const match = phoneString.match(/^\+?(\d{1,3})\s*(.+)$/);
    
    if (!match) {
      return null;
    }
    
    const [, countryCode, number] = match;
    
    // Check for extension
    const extMatch = number.match(/(.+)\s+ext\.?\s*(\d+)/i);
    
    if (extMatch) {
      return {
        countryCode,
        number: extMatch[1],
        extension: extMatch[2],
      };
    }
    
    return {
      countryCode,
      number,
    };
  }

  /**
   * Validate E.164 format
   */
  isValidE164(phone: string): boolean {
    return /^\+1\d{10}$/.test(phone);
  }
}