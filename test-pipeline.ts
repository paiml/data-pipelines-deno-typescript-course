#!/usr/bin/env -S deno run --allow-all

import { createDefaultPipeline, EUDataRecord } from "./src/pipeline/pipeline-orchestrator.ts";

async function testPipeline() {
  console.log("🧪 Testing Pipeline...");
  
  const pipeline = createDefaultPipeline();
  
  const testRecord: EUDataRecord = {
    id: "test-001",
    currency: { amount: 100 },
    dates: ["24/08/2025"],
    measurements: [{ value: 100, unit: "km" }],
  };
  
  const result = await pipeline.processRecord(testRecord);
  
  if (result.success) {
    console.log("✅ Pipeline test successful!");
    console.log("Result:", JSON.stringify(result.value, null, 2));
  } else {
    console.log("❌ Pipeline test failed:", result.error);
  }
  
  await pipeline.cleanup();
}

if (import.meta.main) {
  await testPipeline();
}