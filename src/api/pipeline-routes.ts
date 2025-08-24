import { Router } from "https://deno.land/x/oak@v17.1.3/mod.ts";
import { 
  PipelineOrchestrator, 
  createDefaultPipeline,
  EUDataRecord,
  PipelineConfig,
} from "../pipeline/pipeline-orchestrator.ts";
import { z } from "zod";

// Input validation schemas
const EUDataRecordSchema = z.object({
  id: z.string(),
  currency: z.object({
    amount: z.number().positive(),
  }).optional(),
  measurements: z.array(z.object({
    value: z.number(),
    unit: z.string(),
  })).optional(),
  dates: z.array(z.string()).optional(),
  numbers: z.array(z.string()).optional(),
  address: z.object({
    street: z.string(),
    houseNumber: z.string(),
    postalCode: z.string(),
    city: z.string(),
    country: z.string(),
  }).optional(),
  phone: z.string().optional(),
  vat: z.object({
    amount: z.number(),
    rate: z.number(),
    country: z.string(),
  }).optional(),
  privacy: z.object({
    requestType: z.enum(["access", "deletion", "portability", "rectification"]),
    dataCategories: z.array(z.string()),
    purposes: z.array(z.string()),
  }).optional(),
});

const BatchRequestSchema = z.object({
  records: z.array(EUDataRecordSchema).min(1).max(1000),
  options: z.object({
    parallel: z.boolean().optional(),
    continueOnError: z.boolean().optional(),
  }).optional(),
});

// Pipeline instance (singleton)
let pipeline: PipelineOrchestrator | null = null;

/**
 * Initialize pipeline if not already created
 */
function getPipeline(): PipelineOrchestrator {
  if (!pipeline) {
    pipeline = createDefaultPipeline();
  }
  return pipeline;
}

/**
 * Create pipeline routes
 */
export function createPipelineRoutes(): Router {
  const router = new Router();

  // Process single record
  router.post("/api/pipeline/convert", async (ctx) => {
    try {
      const body = await ctx.request.body.json();
      
      // Validate input
      const validationResult = EUDataRecordSchema.safeParse(body);
      if (!validationResult.success) {
        ctx.response.status = 400;
        ctx.response.body = {
          error: "Validation Error",
          message: "Invalid input data",
          details: validationResult.error.errors,
        };
        return;
      }

      const pipeline = getPipeline();
      const result = await pipeline.processRecord(validationResult.data);

      if (result.success) {
        ctx.response.status = 200;
        ctx.response.body = {
          success: true,
          data: result.data,
          timestamp: new Date().toISOString(),
        };
      } else {
        ctx.response.status = 422;
        ctx.response.body = {
          success: false,
          error: result.error,
          timestamp: new Date().toISOString(),
        };
      }
    } catch (error) {
      ctx.response.status = 500;
      ctx.response.body = {
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      };
    }
  });

  // Process batch of records
  router.post("/api/pipeline/batch", async (ctx) => {
    try {
      const body = await ctx.request.body.json();
      
      // Validate input
      const validationResult = BatchRequestSchema.safeParse(body);
      if (!validationResult.success) {
        ctx.response.status = 400;
        ctx.response.body = {
          error: "Validation Error",
          message: "Invalid batch data",
          details: validationResult.error.errors,
        };
        return;
      }

      const pipeline = getPipeline();
      const startTime = Date.now();
      
      const results = [];
      const errors = [];
      
      // Process records
      if (validationResult.data.options?.parallel !== false) {
        // Parallel processing (default)
        const promises = validationResult.data.records.map(async (record) => {
          const result = await pipeline.processRecord(record);
          if (result.success) {
            results.push(result.data);
          } else if (!validationResult.data.options?.continueOnError) {
            throw new Error(result.error);
          } else {
            errors.push({ id: record.id, error: result.error });
          }
        });
        
        await Promise.all(promises);
      } else {
        // Sequential processing
        for (const record of validationResult.data.records) {
          const result = await pipeline.processRecord(record);
          if (result.success) {
            results.push(result.data);
          } else if (!validationResult.data.options?.continueOnError) {
            ctx.response.status = 422;
            ctx.response.body = {
              success: false,
              error: result.error,
              processedCount: results.length,
              timestamp: new Date().toISOString(),
            };
            return;
          } else {
            errors.push({ id: record.id, error: result.error });
          }
        }
      }

      const duration = Date.now() - startTime;

      ctx.response.status = 200;
      ctx.response.body = {
        success: true,
        data: results,
        errors: errors.length > 0 ? errors : undefined,
        summary: {
          total: validationResult.data.records.length,
          succeeded: results.length,
          failed: errors.length,
          duration,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      ctx.response.status = 500;
      ctx.response.body = {
        error: "Batch Processing Error",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      };
    }
  });

  // Get pipeline metrics
  router.get("/api/pipeline/metrics", (ctx) => {
    try {
      const pipeline = getPipeline();
      const metrics = pipeline.getMetrics();

      ctx.response.status = 200;
      ctx.response.body = {
        success: true,
        metrics,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      ctx.response.status = 500;
      ctx.response.body = {
        error: "Metrics Error",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      };
    }
  });

  // Process dead letter queue
  router.post("/api/pipeline/dlq/process", async (ctx) => {
    try {
      const pipeline = getPipeline();
      await pipeline.processDeadLetterQueue();

      ctx.response.status = 200;
      ctx.response.body = {
        success: true,
        message: "Dead letter queue processing initiated",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      ctx.response.status = 500;
      ctx.response.body = {
        error: "DLQ Processing Error",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      };
    }
  });

  // Individual converter endpoints
  router.post("/api/convert/currency", async (ctx) => {
    await handleSingleConversion(ctx, "currency", { amount: 100 });
  });

  router.post("/api/convert/units", async (ctx) => {
    await handleSingleConversion(ctx, "units", { value: 100, unit: "km" });
  });

  router.post("/api/convert/date", async (ctx) => {
    await handleSingleConversion(ctx, "dates", { date: "24/08/2025" });
  });

  router.post("/api/convert/number", async (ctx) => {
    await handleSingleConversion(ctx, "numbers", { number: "1.234,56" });
  });

  router.post("/api/convert/address", async (ctx) => {
    await handleSingleConversion(ctx, "address", {
      street: "Main Street",
      houseNumber: "123",
      postalCode: "12345",
      city: "Berlin",
      country: "Germany",
    });
  });

  router.post("/api/convert/phone", async (ctx) => {
    await handleSingleConversion(ctx, "phone", { phone: "+49 30 12345678" });
  });

  router.post("/api/convert/tax", async (ctx) => {
    await handleSingleConversion(ctx, "tax", {
      amount: 100,
      rate: 0.19,
      country: "DE",
    });
  });

  router.post("/api/convert/privacy", async (ctx) => {
    await handleSingleConversion(ctx, "privacy", {
      requestType: "access",
      dataCategories: ["personal", "usage"],
      purposes: ["marketing", "analytics"],
    });
  });

  return router;
}

/**
 * Handle single converter endpoint
 */
async function handleSingleConversion(
  ctx: any,
  converterType: string,
  exampleData: any
): Promise<void> {
  try {
    const body = await ctx.request.body.json().catch(() => exampleData);
    
    const pipeline = getPipeline();
    const record: EUDataRecord = {
      id: `single-${Date.now()}`,
    };

    // Set the appropriate field based on converter type
    switch (converterType) {
      case "currency":
        record.currency = body;
        break;
      case "units":
        record.measurements = [body];
        break;
      case "dates":
        record.dates = [body.date || body];
        break;
      case "numbers":
        record.numbers = [body.number || body];
        break;
      case "address":
        record.address = body;
        break;
      case "phone":
        record.phone = body.phone || body;
        break;
      case "tax":
        record.vat = body;
        break;
      case "privacy":
        record.privacy = body;
        break;
    }

    const result = await pipeline.processRecord(record);

    if (result.success) {
      // Extract the converted value
      let convertedData: any;
      switch (converterType) {
        case "currency":
          convertedData = result.data.currency;
          break;
        case "units":
          convertedData = result.data.measurements?.[0];
          break;
        case "dates":
          convertedData = { date: result.data.dates?.[0] };
          break;
        case "numbers":
          convertedData = { number: result.data.numbers?.[0] };
          break;
        case "address":
          convertedData = result.data.address;
          break;
        case "phone":
          convertedData = { formatted: result.data.phone };
          break;
        case "tax":
          convertedData = result.data.salesTax;
          break;
        case "privacy":
          convertedData = result.data.privacy;
          break;
      }

      ctx.response.status = 200;
      ctx.response.body = {
        original: body,
        converted: convertedData,
        timestamp: new Date().toISOString(),
        source: "pipeline",
      };
    } else {
      ctx.response.status = 422;
      ctx.response.body = {
        error: "Conversion Error",
        message: result.error,
        timestamp: new Date().toISOString(),
      };
    }
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = {
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    };
  }
}