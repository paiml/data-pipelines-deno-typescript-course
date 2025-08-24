import {
  EURecord,
  USARecord,
  PipelineConfig,
  PipelineContext,
  PipelineMetrics,
  StreamProcessor,
} from "../types.ts";
import { Result } from "../../shared/types/index.ts";
import {
  EurToUsdConverter,
  MetricToImperialConverter,
  EuToUsaDateConverter,
  EuToUsaNumberConverter,
} from "../../converters/index.ts";
import { MetricUnit } from "../../converters/units/types.ts";

/**
 * Transformation pipeline that converts EU data to USA format
 */
export class ConverterPipeline implements StreamProcessor<EURecord, USARecord> {
  private readonly currencyConverter = new EurToUsdConverter();
  private readonly unitConverter = new MetricToImperialConverter();
  private readonly dateConverter = new EuToUsaDateConverter();
  private readonly numberConverter = new EuToUsaNumberConverter();
  
  private metrics: PipelineMetrics;
  private config: PipelineConfig["transformation"];

  constructor(config?: Partial<PipelineConfig["transformation"]>) {
    this.config = {
      parallel: config?.parallel ?? false,
      maxConcurrency: config?.maxConcurrency ?? 10,
      preserveOriginal: config?.preserveOriginal ?? true,
    };
    
    this.metrics = this.initMetrics();
  }

  /**
   * Process stream of EU records to USA records
   */
  async *process(
    source: AsyncIterable<EURecord>
  ): AsyncIterable<Result<USARecord, Error>> {
    const startTime = Date.now();
    
    for await (const record of source) {
      const processingStart = performance.now();
      
      try {
        const context: PipelineContext = {
          correlationId: record.id,
          startTime: processingStart,
          metadata: new Map(),
          errors: [],
        };

        const result = await this.transformRecord(record, context);
        
        const processingTime = performance.now() - processingStart;
        this.updateMetrics(result.success, processingTime);

        if (result.success) {
          const usaRecord: USARecord = {
            ...result.value,
            processingTime,
          };
          yield Result.ok(usaRecord);
        } else {
          yield result;
        }
      } catch (error) {
        this.metrics.failed++;
        yield Result.err(
          error instanceof Error ? error : new Error(String(error))
        );
      }
    }
  }

  /**
   * Transform a single EU record to USA format
   */
  private async transformRecord(
    record: EURecord,
    context: PipelineContext
  ): Promise<Result<USARecord, Error>> {
    try {
      const transformedData: Record<string, unknown> = {};
      
      // Process based on record type
      switch (record.type) {
        case "currency":
          transformedData.converted = await this.processCurrency(record.data);
          break;
          
        case "unit":
          transformedData.converted = await this.processUnits(record.data);
          break;
          
        case "date":
          transformedData.converted = await this.processDates(record.data);
          break;
          
        case "number":
          transformedData.converted = await this.processNumbers(record.data);
          break;
          
        case "mixed":
          transformedData.converted = await this.processMixed(record.data);
          break;
          
        default:
          return Result.err(new Error(`Unknown record type: ${record.type}`));
      }

      const usaRecord: USARecord = {
        id: record.id,
        timestamp: record.timestamp || new Date(),
        type: record.type,
        data: transformedData,
        originalData: this.config.preserveOriginal ? record.data : undefined,
      };

      return Result.ok(usaRecord);
    } catch (error) {
      return Result.err(
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Process currency data
   */
  private async processCurrency(
    data: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === "number" && key.toLowerCase().includes("eur")) {
        const converted = await this.currencyConverter.convert({
          amount: value,
          currency: "EUR",
        });
        
        if (converted.success) {
          result[key.replace(/eur/gi, "usd")] = converted.value.amount;
          result[`${key}_exchangeRate`] = converted.value.exchangeRate;
        } else {
          result[key] = value;
        }
      } else {
        result[key] = value;
      }
    }
    
    return result;
  }

  /**
   * Process unit measurements
   */
  private async processUnits(
    data: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    
    const unitMappings: Record<string, MetricUnit> = {
      meters: MetricUnit.METER,
      kilometers: MetricUnit.KILOMETER,
      celsius: MetricUnit.CELSIUS,
      kilograms: MetricUnit.KILOGRAM,
      liters: MetricUnit.LITER,
    };
    
    for (const [key, value] of Object.entries(data)) {
      let converted = false;
      
      for (const [unitKey, metricUnit] of Object.entries(unitMappings)) {
        if (key.toLowerCase().includes(unitKey) && typeof value === "number") {
          const conversionResult = await this.unitConverter.convert({
            value,
            unit: metricUnit,
          });
          
          if (conversionResult.success) {
            const newKey = key
              .replace(/meters?/gi, "feet")
              .replace(/kilometers?/gi, "miles")
              .replace(/celsius/gi, "fahrenheit")
              .replace(/kilograms?/gi, "pounds")
              .replace(/liters?/gi, "gallons");
            
            result[newKey] = conversionResult.value.value;
            converted = true;
            break;
          }
        }
      }
      
      if (!converted) {
        result[key] = value;
      }
    }
    
    return result;
  }

  /**
   * Process date formats
   */
  private async processDates(
    data: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === "string" && /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(value)) {
        const converted = await this.dateConverter.convert({
          date: value,
        });
        
        if (converted.success) {
          result[key] = converted.value.date;
        } else {
          result[key] = value;
        }
      } else {
        result[key] = value;
      }
    }
    
    return result;
  }

  /**
   * Process number formats
   */
  private async processNumbers(
    data: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === "string" && /^-?\d{1,3}(\.\d{3})*(\,\d+)?$/.test(value)) {
        const converted = await this.numberConverter.convert({
          value,
        });
        
        if (converted.success) {
          result[key] = converted.value.value;
          result[`${key}_numeric`] = converted.value.numericValue;
        } else {
          result[key] = value;
        }
      } else {
        result[key] = value;
      }
    }
    
    return result;
  }

  /**
   * Process mixed data types
   */
  private async processMixed(
    data: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    let result = { ...data };
    
    // Apply all converters in sequence
    result = await this.processCurrency(result);
    result = await this.processUnits(result);
    result = await this.processDates(result);
    result = await this.processNumbers(result);
    
    return result;
  }

  /**
   * Initialize metrics
   */
  private initMetrics(): PipelineMetrics {
    return {
      processed: 0,
      failed: 0,
      retried: 0,
      throughput: 0,
      avgLatency: 0,
      p99Latency: 0,
      errors: new Map(),
      startTime: new Date(),
    };
  }

  /**
   * Update metrics after processing
   */
  private updateMetrics(success: boolean, latency: number): void {
    if (success) {
      this.metrics.processed++;
    } else {
      this.metrics.failed++;
    }
    
    // Update latency metrics (simplified)
    const total = this.metrics.processed + this.metrics.failed;
    this.metrics.avgLatency = 
      (this.metrics.avgLatency * (total - 1) + latency) / total;
    
    // Update P99 (simplified - should use proper percentile calculation)
    if (latency > this.metrics.p99Latency) {
      this.metrics.p99Latency = latency;
    }
    
    // Calculate throughput
    const elapsed = (Date.now() - this.metrics.startTime.getTime()) / 1000;
    this.metrics.throughput = total / elapsed;
  }

  /**
   * Get current metrics
   */
  getMetrics(): PipelineMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.metrics = this.initMetrics();
  }
}