#!/usr/bin/env -S deno run --allow-all

import { parse } from "https://deno.land/std@0.203.0/flags/mod.ts";
import { 
  PipelineOrchestrator, 
  createDefaultPipeline,
  EUDataRecord,
} from "../pipeline/pipeline-orchestrator.ts";
import { green, red, yellow, bold, blue } from "https://deno.land/std@0.203.0/fmt/colors.ts";

interface CLIArgs {
  help?: boolean;
  version?: boolean;
  input?: string;
  output?: string;
  format?: string;
  batch?: boolean;
  parallel?: boolean;
  cache?: boolean;
  metrics?: boolean;
  verbose?: boolean;
  server?: boolean;
  port?: number;
  watch?: boolean;
}

const VERSION = "1.0.0";
const BANNER = `
╔═══════════════════════════════════════════╗
║   EU to USA Data Pipeline CLI v${VERSION}    ║
║   Convert EU data formats to USA standards ║
╚═══════════════════════════════════════════╝
`;

function showHelp(): void {
  console.log(BANNER);
  console.log(`
${bold("USAGE:")}
  pipeline-cli [OPTIONS] [FILE]

${bold("DESCRIPTION:")}
  Command-line interface for the EU to USA Data Pipeline.
  Converts various EU data formats to USA standards including:
  - Currency (EUR → USD)
  - Units (Metric → Imperial)
  - Dates (DD/MM/YYYY → MM/DD/YYYY)
  - Numbers (1.234,56 → 1,234.56)
  - Addresses, Phone numbers, Tax (VAT → Sales Tax)
  - Privacy (GDPR → CCPA)

${bold("OPTIONS:")}
  -h, --help          Show this help message
  -v, --version       Show version information
  -i, --input FILE    Input file path (JSON format)
  -o, --output FILE   Output file path (default: stdout)
  -f, --format FORMAT Output format: json, csv, yaml (default: json)
  -b, --batch         Process as batch (input must be array)
  -p, --parallel      Enable parallel processing for batch
  -c, --cache         Enable caching for conversions
  -m, --metrics       Show performance metrics after processing
  --verbose           Enable verbose logging
  --server            Start as HTTP server
  --port PORT         Server port (default: 8080)
  --watch             Watch input file for changes

${bold("EXAMPLES:")}
  # Convert single record from file
  pipeline-cli -i data.json -o converted.json

  # Process batch with metrics
  pipeline-cli -i batch.json -b -m --parallel

  # Start as server
  pipeline-cli --server --port 3000

  # Watch file for changes
  pipeline-cli -i data.json --watch --verbose

  # Pipe from stdin
  echo '{"id":"1","currency":{"amount":100}}' | pipeline-cli

${bold("INPUT FORMAT:")}
  Single record:
  {
    "id": "record-001",
    "currency": { "amount": 100 },
    "dates": ["24/08/2025"],
    "address": {
      "street": "Main Street",
      "houseNumber": "123",
      "postalCode": "12345",
      "city": "Berlin",
      "country": "Germany"
    }
  }

  Batch (with -b flag):
  [
    { "id": "1", "currency": { "amount": 100 } },
    { "id": "2", "currency": { "amount": 200 } }
  ]

${bold("OUTPUT FORMATS:")}
  JSON:  Standard JSON output (default)
  CSV:   Flattened CSV format
  YAML:  Human-readable YAML format
`);
}

function showVersion(): void {
  console.log(`EU to USA Data Pipeline CLI v${VERSION}`);
  console.log(`Deno ${Deno.version.deno}`);
  console.log(`TypeScript ${Deno.version.typescript}`);
  console.log(`V8 ${Deno.version.v8}`);
}

async function readInput(path?: string): Promise<string> {
  if (path && path !== "-") {
    try {
      return await Deno.readTextFile(path);
    } catch (error) {
      throw new Error(`Failed to read input file: ${error.message}`);
    }
  }
  
  // Read from stdin
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  
  for await (const chunk of Deno.stdin.readable) {
    chunks.push(decoder.decode(chunk));
  }
  
  return chunks.join("");
}

async function writeOutput(data: string, path?: string): Promise<void> {
  if (path && path !== "-") {
    try {
      await Deno.writeTextFile(path, data);
      console.log(green(`✅ Output written to ${path}`));
    } catch (error) {
      throw new Error(`Failed to write output file: ${error.message}`);
    }
  } else {
    console.log(data);
  }
}

function formatOutput(data: any, format: string): string {
  switch (format) {
    case "json":
      return JSON.stringify(data, null, 2);
      
    case "csv":
      return convertToCSV(data);
      
    case "yaml":
      return convertToYAML(data);
      
    default:
      return JSON.stringify(data, null, 2);
  }
}

function convertToCSV(data: any): string {
  const records = Array.isArray(data) ? data : [data];
  if (records.length === 0) return "";
  
  // Flatten objects and get headers
  const flattened = records.map(record => flattenObject(record));
  const headers = [...new Set(flattened.flatMap(r => Object.keys(r)))];
  
  // Create CSV
  const csv: string[] = [headers.join(",")];
  
  for (const record of flattened) {
    const row = headers.map(h => {
      const value = record[h] ?? "";
      // Quote if contains comma or newline
      return String(value).includes(",") || String(value).includes("\n")
        ? `"${String(value).replace(/"/g, '""')}"`
        : String(value);
    });
    csv.push(row.join(","));
  }
  
  return csv.join("\n");
}

function flattenObject(obj: any, prefix = ""): Record<string, any> {
  const result: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    
    if (value === null || value === undefined) {
      result[newKey] = "";
    } else if (typeof value === "object" && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, newKey));
    } else if (Array.isArray(value)) {
      result[newKey] = value.join("; ");
    } else {
      result[newKey] = value;
    }
  }
  
  return result;
}

function convertToYAML(data: any, indent = 0): string {
  const spaces = "  ".repeat(indent);
  const lines: string[] = [];
  
  if (Array.isArray(data)) {
    for (const item of data) {
      lines.push(`${spaces}- ${convertToYAML(item, indent + 1).trim()}`);
    }
  } else if (typeof data === "object" && data !== null) {
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === "object" && value !== null) {
        lines.push(`${spaces}${key}:`);
        lines.push(convertToYAML(value, indent + 1));
      } else {
        lines.push(`${spaces}${key}: ${JSON.stringify(value)}`);
      }
    }
  } else {
    return `${spaces}${JSON.stringify(data)}`;
  }
  
  return lines.join("\n");
}

async function processFile(
  inputPath: string | undefined,
  outputPath: string | undefined,
  options: CLIArgs,
  pipeline: PipelineOrchestrator
): Promise<void> {
  try {
    // Read input
    const inputText = await readInput(inputPath);
    const inputData = JSON.parse(inputText);
    
    // Process data
    let result;
    let processingTime;
    
    const startTime = Date.now();
    
    if (options.batch || Array.isArray(inputData)) {
      if (!Array.isArray(inputData)) {
        throw new Error("Batch mode requires input to be an array");
      }
      
      console.log(blue(`Processing ${inputData.length} records...`));
      result = await pipeline.processBatch(inputData);
      
      if (result.success) {
        processingTime = Date.now() - startTime;
        console.log(green(`✅ Processed ${result.data.length} records in ${processingTime}ms`));
      }
    } else {
      console.log(blue("Processing single record..."));
      result = await pipeline.processRecord(inputData);
      processingTime = Date.now() - startTime;
      
      if (result.success) {
        console.log(green(`✅ Record processed in ${processingTime}ms`));
      }
    }
    
    if (!result.success) {
      throw new Error(result.error);
    }
    
    // Format and write output
    const formatted = formatOutput(
      result.data,
      options.format || "json"
    );
    
    await writeOutput(formatted, outputPath);
    
    // Show metrics if requested
    if (options.metrics) {
      console.log("\n" + bold("📊 Performance Metrics:"));
      const metrics = pipeline.getMetrics();
      
      console.log(`  Cache hits: ${metrics.cache?.stats.hits || 0}`);
      console.log(`  Cache misses: ${metrics.cache?.stats.misses || 0}`);
      console.log(`  Processing time: ${processingTime}ms`);
      
      if (options.batch && Array.isArray(result.data)) {
        const avgTime = processingTime / result.data.length;
        console.log(`  Average per record: ${avgTime.toFixed(2)}ms`);
        console.log(`  Throughput: ${(1000 / avgTime).toFixed(2)} records/sec`);
      }
    }
    
  } catch (error) {
    console.error(red(`❌ Error: ${error.message}`));
    if (options.verbose) {
      console.error(error.stack);
    }
    Deno.exit(1);
  }
}

async function watchFile(
  inputPath: string,
  outputPath: string | undefined,
  options: CLIArgs,
  pipeline: PipelineOrchestrator
): Promise<void> {
  console.log(yellow(`👁️  Watching ${inputPath} for changes...`));
  
  const watcher = Deno.watchFs(inputPath);
  
  for await (const event of watcher) {
    if (event.kind === "modify") {
      console.log(blue(`\n🔄 File changed, reprocessing...`));
      await processFile(inputPath, outputPath, options, pipeline);
    }
  }
}

async function startServer(port: number, pipeline: PipelineOrchestrator): Promise<void> {
  const { Application, Router } = await import("https://deno.land/x/oak@v17.1.3/mod.ts");
  const { createPipelineRoutes } = await import("../api/pipeline-routes.ts");
  
  const app = new Application();
  const router = new Router();
  
  // Health check
  router.get("/health", (ctx) => {
    ctx.response.body = { status: "healthy", service: "pipeline-cli" };
  });
  
  // Add pipeline routes
  const pipelineRoutes = createPipelineRoutes();
  app.use(router.routes());
  app.use(router.allowedMethods());
  app.use(pipelineRoutes.routes());
  app.use(pipelineRoutes.allowedMethods());
  
  console.log(BANNER);
  console.log(green(`🚀 Server running at http://localhost:${port}`));
  console.log(yellow("Press Ctrl+C to stop\n"));
  
  await app.listen({ port });
}

async function main(): Promise<void> {
  const args = parse(Deno.args, {
    alias: {
      h: "help",
      v: "version",
      i: "input",
      o: "output",
      f: "format",
      b: "batch",
      p: "parallel",
      c: "cache",
      m: "metrics",
    },
    boolean: ["help", "version", "batch", "parallel", "cache", "metrics", "verbose", "server", "watch"],
    string: ["input", "output", "format"],
    default: {
      port: 8080,
    },
  }) as CLIArgs;
  
  // Handle help and version
  if (args.help) {
    showHelp();
    return;
  }
  
  if (args.version) {
    showVersion();
    return;
  }
  
  // Create pipeline
  const pipeline = createDefaultPipeline();
  
  // Start server mode
  if (args.server) {
    await startServer(args.port || 8080, pipeline);
    return;
  }
  
  // Get input path (from flag or first positional argument)
  const inputPath = args.input || args._[0] as string | undefined;
  
  // Watch mode
  if (args.watch) {
    if (!inputPath || inputPath === "-") {
      console.error(red("❌ Watch mode requires an input file path"));
      Deno.exit(1);
    }
    await watchFile(inputPath, args.output, args, pipeline);
    return;
  }
  
  // Process file
  await processFile(inputPath, args.output, args, pipeline);
  
  // Cleanup
  await pipeline.cleanup();
}

// Run CLI
if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(red(`❌ Fatal error: ${error.message}`));
    Deno.exit(1);
  }
}