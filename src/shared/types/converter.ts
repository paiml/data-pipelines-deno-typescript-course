import { Result } from "./result.ts";

/**
 * Base converter interface for all EU to USA conversions
 */
export interface Converter<TInput, TOutput> {
  /**
   * Convert EU format to USA format
   * @param input - EU formatted data
   * @param config - Optional configuration
   * @returns Result with converted data or error
   */
  convert(
    input: TInput,
    config?: ConverterConfig,
  ): Promise<Result<TOutput, ConversionError>>;

  /**
   * Validate input before conversion
   * @param input - Data to validate
   * @returns Whether input is valid
   */
  validate(input: unknown): input is TInput;

  /**
   * Get converter metadata
   */
  getMetadata(): ConverterMetadata;
}

/**
 * Configuration for converters
 */
export interface ConverterConfig {
  /** Skip validation step */
  skipValidation?: boolean;
  /** Use cached values if available */
  useCache?: boolean;
  /** Cache TTL in milliseconds */
  cacheTTL?: number;
  /** Custom locale settings */
  locale?: string;
  /** Timezone for date conversions */
  timezone?: string;
}

/**
 * Metadata about a converter
 */
export interface ConverterMetadata {
  name: string;
  version: string;
  inputType: string;
  outputType: string;
  description: string;
  performanceTarget: {
    p50: number;
    p95: number;
    p99: number;
  };
}

/**
 * Standard error for conversion failures
 */
export class ConversionError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly details?: unknown,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = "ConversionError";
  }
}

/**
 * Error codes for conversion failures
 */
export enum ErrorCode {
  // Validation errors
  INVALID_INPUT = "INVALID_INPUT",
  MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD",
  TYPE_MISMATCH = "TYPE_MISMATCH",
  OUT_OF_RANGE = "OUT_OF_RANGE",

  // Conversion errors
  CONVERSION_FAILED = "CONVERSION_FAILED",
  UNSUPPORTED_FORMAT = "UNSUPPORTED_FORMAT",
  PRECISION_LOSS = "PRECISION_LOSS",

  // External service errors
  API_ERROR = "API_ERROR",
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
  TIMEOUT = "TIMEOUT",

  // System errors
  INTERNAL_ERROR = "INTERNAL_ERROR",
  CONFIGURATION_ERROR = "CONFIGURATION_ERROR",
  CACHE_ERROR = "CACHE_ERROR",
}