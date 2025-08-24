import { z } from "zod";

/**
 * Supported metric unit types
 */
export enum MetricUnit {
  // Length
  MILLIMETER = "mm",
  CENTIMETER = "cm",
  METER = "m",
  KILOMETER = "km",
  
  // Weight
  GRAM = "g",
  KILOGRAM = "kg",
  TONNE = "t",
  
  // Volume
  MILLILITER = "ml",
  LITER = "l",
  
  // Temperature
  CELSIUS = "°C",
}

/**
 * Supported imperial unit types
 */
export enum ImperialUnit {
  // Length
  INCH = "in",
  FOOT = "ft",
  YARD = "yd",
  MILE = "mi",
  
  // Weight
  OUNCE = "oz",
  POUND = "lb",
  TON = "ton",
  
  // Volume
  FLUID_OUNCE = "fl oz",
  CUP = "cup",
  PINT = "pt",
  QUART = "qt",
  GALLON = "gal",
  
  // Temperature
  FAHRENHEIT = "°F",
}

/**
 * Metric measurement schema
 */
export const MetricMeasurementSchema = z.object({
  value: z.number().finite(),
  unit: z.nativeEnum(MetricUnit),
  precision: z.number().int().min(0).max(10).optional(),
});

export type MetricMeasurement = z.infer<typeof MetricMeasurementSchema>;

/**
 * Imperial measurement schema
 */
export const ImperialMeasurementSchema = z.object({
  value: z.number().finite(),
  unit: z.nativeEnum(ImperialUnit),
  precision: z.number().int().min(0).max(10),
  originalValue: z.number().finite(),
  originalUnit: z.nativeEnum(MetricUnit),
});

export type ImperialMeasurement = z.infer<typeof ImperialMeasurementSchema>;

/**
 * Unit conversion mapping
 */
export interface UnitConversion {
  from: MetricUnit;
  to: ImperialUnit;
  factor: number;
  offset?: number; // For temperature conversions
}