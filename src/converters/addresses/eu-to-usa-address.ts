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
 * EU address format schema
 */
export const EUAddressSchema = z.object({
  street: z.string(),
  houseNumber: z.string().optional(),
  postalCode: z.string(),
  city: z.string(),
  country: z.string(),
  state: z.string().optional(),
  apartment: z.string().optional(),
});

export type EUAddress = z.infer<typeof EUAddressSchema>;

/**
 * USA address format schema
 */
export const USAAddressSchema = z.object({
  streetNumber: z.string().optional(),
  streetName: z.string(),
  apartment: z.string().optional(),
  city: z.string(),
  state: z.string(),
  zipCode: z.string(),
  country: z.string(),
  formatted: z.string(),
});

export type USAAddress = z.infer<typeof USAAddressSchema>;

/**
 * Country to state mapping for common EU countries
 */
const EU_COUNTRY_TO_US_STATE: Record<string, string> = {
  // Map EU countries to comparable US states (for demo purposes)
  "Germany": "TX", // Texas (large industrial)
  "France": "CA", // California (diverse economy)
  "Italy": "NY", // New York (cultural center)
  "Spain": "FL", // Florida (tourism)
  "Netherlands": "MA", // Massachusetts (trade hub)
  "Belgium": "DC", // Washington DC (capital region)
  "Poland": "IL", // Illinois (industrial)
  "Sweden": "WA", // Washington (tech hub)
  "Denmark": "OR", // Oregon (progressive)
  "Austria": "CO", // Colorado (mountainous)
  "Ireland": "MA", // Massachusetts (Irish heritage)
  "Portugal": "RI", // Rhode Island (coastal)
  "Greece": "FL", // Florida (tourism, coastal)
  "Czech Republic": "OH", // Ohio (industrial)
  "Finland": "MN", // Minnesota (cold climate)
};

/**
 * Converts EU address format to USA address format
 */
export class EuToUsaAddressConverter implements Converter<EUAddress, USAAddress> {
  /**
   * Convert EU address to USA format
   */
  async convert(
    input: EUAddress,
    config?: ConverterConfig,
  ): Promise<Result<USAAddress, ConversionError>> {
    try {
      // Validate input if not skipped
      if (!config?.skipValidation && !this.validate(input)) {
        return Result.err(
          new ConversionError(
            "Invalid EU address format",
            ErrorCode.INVALID_INPUT,
            { input },
          ),
        );
      }

      // Parse and convert address components
      const streetNumber = this.extractStreetNumber(input);
      const streetName = this.extractStreetName(input);
      const state = this.mapToUSState(input);
      const zipCode = this.convertPostalCode(input.postalCode);

      // Format USA address
      const formatted = this.formatUSAAddress({
        streetNumber,
        streetName,
        apartment: input.apartment,
        city: input.city,
        state,
        zipCode,
      });

      const result: USAAddress = {
        streetNumber,
        streetName,
        apartment: input.apartment,
        city: input.city,
        state,
        zipCode,
        country: "USA",
        formatted,
      };

      return Result.ok(result);
    } catch (error) {
      return Result.err(
        new ConversionError(
          `Address conversion failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          ErrorCode.CONVERSION_FAILED,
          { input, error },
          false,
        ),
      );
    }
  }

  /**
   * Validate input is a valid EU address
   */
  validate(input: unknown): input is EUAddress {
    const result = EUAddressSchema.safeParse(input);
    return result.success;
  }

  /**
   * Get converter metadata
   */
  getMetadata(): ConverterMetadata {
    return {
      name: "EU to USA Address Converter",
      version: "1.0.0",
      inputType: "EUAddress",
      outputType: "USAAddress",
      description: "Converts EU address format to USA address format",
      performanceTarget: {
        p50: 10,
        p95: 20,
        p99: 30,
      },
    };
  }

  /**
   * Extract street number from EU address
   */
  private extractStreetNumber(address: EUAddress): string {
    // EU addresses often have house number separate or at the end
    if (address.houseNumber) {
      return address.houseNumber;
    }

    // Try to extract from street string
    const match = address.street.match(/\d+[a-zA-Z]?/);
    return match ? match[0] : "";
  }

  /**
   * Extract street name from EU address
   */
  private extractStreetName(address: EUAddress): string {
    // Remove house number if present in street
    let street = address.street;
    
    if (!address.houseNumber) {
      // Remove trailing or leading numbers
      street = street.replace(/^\d+[a-zA-Z]?\s*/, "").replace(/\s*\d+[a-zA-Z]?$/, "");
    }

    // Convert common EU street types to US equivalents
    street = street
      .replace(/strasse|straße/gi, "Street")
      .replace(/platz/gi, "Plaza")
      .replace(/weg/gi, "Way")
      .replace(/allee/gi, "Avenue")
      .replace(/ring/gi, "Circle")
      .replace(/gasse/gi, "Lane")
      .replace(/rue/gi, "Street")
      .replace(/avenue/gi, "Avenue")
      .replace(/boulevard/gi, "Boulevard")
      .replace(/place/gi, "Place")
      .replace(/via/gi, "Street")
      .replace(/calle/gi, "Street")
      .replace(/plaza/gi, "Plaza")
      .replace(/avenida/gi, "Avenue");

    return street;
  }

  /**
   * Map EU country/state to US state
   */
  private mapToUSState(address: EUAddress): string {
    // If state is provided, try to use it
    if (address.state) {
      // Check if it's already a US state code
      if (/^[A-Z]{2}$/.test(address.state)) {
        return address.state;
      }
    }

    // Map country to a comparable US state
    const mappedState = EU_COUNTRY_TO_US_STATE[address.country];
    if (mappedState) {
      return mappedState;
    }

    // Default to a generic state
    return "NY";
  }

  /**
   * Convert EU postal code to US ZIP code format
   */
  private convertPostalCode(postalCode: string): string {
    // Remove all non-alphanumeric characters
    const cleaned = postalCode.replace(/[^0-9A-Z]/gi, "");

    // Pad or truncate to 5 digits for US ZIP
    if (cleaned.length >= 5) {
      return cleaned.substring(0, 5);
    } else {
      // Pad with zeros
      return cleaned.padEnd(5, "0");
    }
  }

  /**
   * Format USA address string
   */
  private formatUSAAddress(components: {
    streetNumber?: string;
    streetName: string;
    apartment?: string;
    city: string;
    state: string;
    zipCode: string;
  }): string {
    const lines: string[] = [];

    // Line 1: Street address
    let line1 = "";
    if (components.streetNumber) {
      line1 = `${components.streetNumber} ${components.streetName}`;
    } else {
      line1 = components.streetName;
    }
    
    if (components.apartment) {
      line1 += `, Apt ${components.apartment}`;
    }
    lines.push(line1);

    // Line 2: City, State ZIP
    lines.push(`${components.city}, ${components.state} ${components.zipCode}`);

    return lines.join("\n");
  }

  /**
   * Parse EU address string (convenience method)
   */
  parseEUAddress(addressString: string): EUAddress | null {
    // Simple parser for common EU address formats
    const lines = addressString.split(/[\n,]/);
    
    if (lines.length < 2) {
      return null;
    }

    try {
      return {
        street: lines[0].trim(),
        postalCode: lines[1]?.match(/\d{4,5}/)?.[0] || "",
        city: lines[1]?.replace(/\d{4,5}/, "").trim() || lines[2]?.trim() || "",
        country: lines[lines.length - 1].trim(),
      };
    } catch {
      return null;
    }
  }
}