import { Decimal } from "decimal.js";
import {
  Converter,
  ConverterConfig,
  ConverterMetadata,
  ConversionError,
  ErrorCode,
  Result,
} from "../../shared/types/index.ts";
import {
  ImperialMeasurement,
  ImperialUnit,
  MetricMeasurement,
  MetricMeasurementSchema,
  MetricUnit,
  UnitConversion,
} from "./types.ts";

/**
 * Converts metric units to imperial units with precision handling
 */
export class MetricToImperialConverter implements Converter<MetricMeasurement, ImperialMeasurement> {
  private readonly conversions: Map<string, UnitConversion>;

  constructor() {
    this.conversions = this.initializeConversions();
  }

  /**
   * Convert metric measurement to imperial
   */
  async convert(
    input: MetricMeasurement,
    config?: ConverterConfig,
  ): Promise<Result<ImperialMeasurement, ConversionError>> {
    try {
      // Validate input if not skipped
      if (!config?.skipValidation && !this.validate(input)) {
        return Result.err(
          new ConversionError(
            "Invalid metric measurement format",
            ErrorCode.INVALID_INPUT,
            { input },
          ),
        );
      }

      // Find appropriate conversion
      const imperialUnit = this.getImperialUnit(input.unit);
      if (!imperialUnit) {
        return Result.err(
          new ConversionError(
            `No imperial conversion available for ${input.unit}`,
            ErrorCode.UNSUPPORTED_FORMAT,
            { unit: input.unit },
          ),
        );
      }

      const conversionKey = `${input.unit}-${imperialUnit}`;
      const conversion = this.conversions.get(conversionKey);
      
      if (!conversion) {
        return Result.err(
          new ConversionError(
            `Conversion not found: ${conversionKey}`,
            ErrorCode.CONVERSION_FAILED,
            { from: input.unit, to: imperialUnit },
          ),
        );
      }

      // Perform conversion with Decimal for precision
      const metricDecimal = new Decimal(input.value);
      let imperialDecimal: Decimal;

      if (conversion.offset !== undefined) {
        // Temperature conversion: (C * 9/5) + 32
        imperialDecimal = metricDecimal.mul(conversion.factor).plus(conversion.offset);
      } else {
        // Regular multiplication
        imperialDecimal = metricDecimal.mul(conversion.factor);
      }

      // Round to specified precision
      const precision = input.precision ?? 2;
      const roundedValue = imperialDecimal.toDecimalPlaces(
        precision,
        Decimal.ROUND_HALF_UP,
      );

      const result: ImperialMeasurement = {
        value: roundedValue.toNumber(),
        unit: imperialUnit,
        precision,
        originalValue: input.value,
        originalUnit: input.unit,
      };

      return Result.ok(result);
    } catch (error) {
      return Result.err(
        new ConversionError(
          `Unit conversion failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          ErrorCode.CONVERSION_FAILED,
          { input, error },
          false,
        ),
      );
    }
  }

  /**
   * Validate input is a valid metric measurement
   */
  validate(input: unknown): input is MetricMeasurement {
    const result = MetricMeasurementSchema.safeParse(input);
    return result.success;
  }

  /**
   * Get converter metadata
   */
  getMetadata(): ConverterMetadata {
    return {
      name: "Metric to Imperial Converter",
      version: "1.0.0",
      inputType: "MetricMeasurement",
      outputType: "ImperialMeasurement",
      description: "Converts metric units to imperial units (length, weight, volume, temperature)",
      performanceTarget: {
        p50: 2,
        p95: 3,
        p99: 5,
      },
    };
  }

  /**
   * Get the appropriate imperial unit for a metric unit
   */
  private getImperialUnit(metricUnit: MetricUnit): ImperialUnit | null {
    const mapping: Record<MetricUnit, ImperialUnit> = {
      // Length
      [MetricUnit.MILLIMETER]: ImperialUnit.INCH,
      [MetricUnit.CENTIMETER]: ImperialUnit.INCH,
      [MetricUnit.METER]: ImperialUnit.FOOT,
      [MetricUnit.KILOMETER]: ImperialUnit.MILE,
      
      // Weight
      [MetricUnit.GRAM]: ImperialUnit.OUNCE,
      [MetricUnit.KILOGRAM]: ImperialUnit.POUND,
      [MetricUnit.TONNE]: ImperialUnit.TON,
      
      // Volume
      [MetricUnit.MILLILITER]: ImperialUnit.FLUID_OUNCE,
      [MetricUnit.LITER]: ImperialUnit.GALLON,
      
      // Temperature
      [MetricUnit.CELSIUS]: ImperialUnit.FAHRENHEIT,
    };

    return mapping[metricUnit] || null;
  }

  /**
   * Initialize conversion factors
   */
  private initializeConversions(): Map<string, UnitConversion> {
    const conversions: UnitConversion[] = [
      // Length conversions
      { from: MetricUnit.MILLIMETER, to: ImperialUnit.INCH, factor: 0.0393701 },
      { from: MetricUnit.CENTIMETER, to: ImperialUnit.INCH, factor: 0.393701 },
      { from: MetricUnit.METER, to: ImperialUnit.FOOT, factor: 3.28084 },
      { from: MetricUnit.KILOMETER, to: ImperialUnit.MILE, factor: 0.621371 },
      
      // Weight conversions
      { from: MetricUnit.GRAM, to: ImperialUnit.OUNCE, factor: 0.035274 },
      { from: MetricUnit.KILOGRAM, to: ImperialUnit.POUND, factor: 2.20462 },
      { from: MetricUnit.TONNE, to: ImperialUnit.TON, factor: 1.10231 },
      
      // Volume conversions
      { from: MetricUnit.MILLILITER, to: ImperialUnit.FLUID_OUNCE, factor: 0.033814 },
      { from: MetricUnit.LITER, to: ImperialUnit.GALLON, factor: 0.264172 },
      
      // Temperature conversion (special case with offset)
      { from: MetricUnit.CELSIUS, to: ImperialUnit.FAHRENHEIT, factor: 9/5, offset: 32 },
    ];

    const map = new Map<string, UnitConversion>();
    for (const conversion of conversions) {
      map.set(`${conversion.from}-${conversion.to}`, conversion);
    }
    
    return map;
  }

  /**
   * Convert temperature specifically (convenience method)
   */
  celsiusToFahrenheit(celsius: number): number {
    return (celsius * 9/5) + 32;
  }

  /**
   * Convert length specifically (convenience methods)
   */
  metersToFeet(meters: number): number {
    return meters * 3.28084;
  }

  kilometersToMiles(kilometers: number): number {
    return kilometers * 0.621371;
  }

  /**
   * Convert weight specifically (convenience methods)
   */
  kilogramsToPounds(kilograms: number): number {
    return kilograms * 2.20462;
  }

  /**
   * Convert volume specifically (convenience methods)
   */
  litersToGallons(liters: number): number {
    return liters * 0.264172;
  }
}