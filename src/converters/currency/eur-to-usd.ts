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
  EURAmount,
  EURAmountSchema,
  ExchangeRate,
  USDAmount,
} from "./types.ts";

/**
 * Converts EUR amounts to USD with precision handling and caching
 */
export class EurToUsdConverter implements Converter<EURAmount, USDAmount> {
  private cache = new Map<string, ExchangeRate>();
  private readonly DEFAULT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly FALLBACK_RATE = 1.08; // Fallback exchange rate

  /**
   * Convert EUR amount to USD
   */
  async convert(
    input: EURAmount,
    config?: ConverterConfig,
  ): Promise<Result<USDAmount, ConversionError>> {
    try {
      // Validate input if not skipped
      if (!config?.skipValidation && !this.validate(input)) {
        return Result.err(
          new ConversionError(
            "Invalid EUR amount format",
            ErrorCode.INVALID_INPUT,
            { input },
          ),
        );
      }

      // Get exchange rate
      const rate = await this.getExchangeRate(
        "EUR",
        "USD",
        config?.useCache ?? true,
        config?.cacheTTL ?? this.DEFAULT_CACHE_TTL,
      );

      // Perform conversion with Decimal for precision
      const eurDecimal = new Decimal(input.amount);
      const usdDecimal = eurDecimal.mul(rate.rate);

      // Round to specified precision
      const precision = input.precision ?? 2;
      const roundedAmount = usdDecimal.toDecimalPlaces(
        precision,
        Decimal.ROUND_HALF_UP,
      );

      const result: USDAmount = {
        amount: roundedAmount.toNumber(),
        currency: "USD",
        precision,
        exchangeRate: rate.rate,
        timestamp: rate.timestamp,
      };

      return Result.ok(result);
    } catch (error) {
      return Result.err(
        new ConversionError(
          `Currency conversion failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          ErrorCode.CONVERSION_FAILED,
          { input, error },
          true, // Retryable
        ),
      );
    }
  }

  /**
   * Validate input is a valid EUR amount
   */
  validate(input: unknown): input is EURAmount {
    const result = EURAmountSchema.safeParse(input);
    return result.success;
  }

  /**
   * Get converter metadata
   */
  getMetadata(): ConverterMetadata {
    return {
      name: "EUR to USD Converter",
      version: "1.0.0",
      inputType: "EURAmount",
      outputType: "USDAmount",
      description: "Converts EUR currency amounts to USD with real-time exchange rates",
      performanceTarget: {
        p50: 5,
        p95: 8,
        p99: 10,
      },
    };
  }

  /**
   * Get exchange rate with caching
   */
  private async getExchangeRate(
    from: string,
    to: string,
    useCache: boolean,
    cacheTTL: number,
  ): Promise<ExchangeRate> {
    const cacheKey = `${from}-${to}`;

    // Check cache if enabled
    if (useCache) {
      const cached = this.cache.get(cacheKey);
      if (cached && this.isCacheValid(cached, cacheTTL)) {
        return cached;
      }
    }

    // Fetch new rate
    try {
      const rate = await this.fetchExchangeRate(from, to);
      
      // Update cache
      this.cache.set(cacheKey, rate);
      
      return rate;
    } catch (error) {
      // Use fallback rate if API fails
      console.warn(`Failed to fetch exchange rate, using fallback: ${error}`);
      return {
        from,
        to,
        rate: this.FALLBACK_RATE,
        timestamp: new Date(),
        source: "fallback",
      };
    }
  }

  /**
   * Check if cached rate is still valid
   */
  private isCacheValid(rate: ExchangeRate, ttl: number): boolean {
    const age = Date.now() - rate.timestamp.getTime();
    return age < ttl;
  }

  /**
   * Fetch exchange rate from API
   * In production, this would call a real API
   */
  private async fetchExchangeRate(
    from: string,
    to: string,
  ): Promise<ExchangeRate> {
    // Simulate API call delay
    await new Promise((resolve) => setTimeout(resolve, 10));

    // In production, replace with actual API call
    // const response = await fetch(`https://api.exchangerate.host/convert?from=${from}&to=${to}`);
    // const data = await response.json();

    // Simulated response with realistic variation
    const baseRate = 1.08;
    const variation = (Math.random() - 0.5) * 0.02; // ±1% variation
    const rate = baseRate + variation;

    return {
      from,
      to,
      rate: Number(rate.toFixed(4)),
      timestamp: new Date(),
      source: "simulated",
    };
  }

  /**
   * Clear the exchange rate cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get current cache size
   */
  getCacheSize(): number {
    return this.cache.size;
  }
}