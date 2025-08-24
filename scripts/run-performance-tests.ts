#!/usr/bin/env -S deno run --allow-all
// Performance Testing Runner for EU-USA Data Pipeline
// This script orchestrates all performance tests and generates reports

import { parse } from "https://deno.land/std@0.203.0/flags/mod.ts";

interface TestResult {
  name: string;
  success: boolean;
  duration: number;
  output: string;
  error?: string;
}

interface PerformanceReport {
  timestamp: string;
  environment: {
    deno: string;
    os: string;
    arch: string;
  };
  tests: TestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    totalDuration: number;
  };
}

async function runCommand(
  name: string,
  cmd: string[],
  options: { cwd?: string; env?: Record<string, string> } = {}
): Promise<TestResult> {
  console.log(`🔄 Running ${name}...`);
  
  const startTime = Date.now();
  
  try {
    const process = new Deno.Command(cmd[0], {
      args: cmd.slice(1),
      cwd: options.cwd,
      env: { ...Deno.env.toObject(), ...options.env },
      stdout: "piped",
      stderr: "piped",
    });
    
    const output = await process.output();
    const duration = Date.now() - startTime;
    
    const stdout = new TextDecoder().decode(output.stdout);
    const stderr = new TextDecoder().decode(output.stderr);
    const combinedOutput = `${stdout}\n${stderr}`.trim();
    
    if (output.success) {
      console.log(`✅ ${name} completed in ${duration}ms`);
      return {
        name,
        success: true,
        duration,
        output: combinedOutput,
      };
    } else {
      console.log(`❌ ${name} failed in ${duration}ms`);
      return {
        name,
        success: false,
        duration,
        output: combinedOutput,
        error: `Process exited with code ${output.code}`,
      };
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    console.log(`❌ ${name} error in ${duration}ms: ${error.message}`);
    return {
      name,
      success: false,
      duration,
      output: "",
      error: error.message,
    };
  }
}

async function checkPrerequisites(): Promise<void> {
  console.log("🔍 Checking prerequisites...");
  
  // Check Deno version
  try {
    const denoVersion = await runCommand("Deno Version Check", ["deno", "--version"]);
    if (!denoVersion.success) {
      throw new Error("Deno is not available");
    }
  } catch {
    throw new Error("Deno is required but not found");
  }
  
  // Check if k6 is available for load tests
  try {
    await runCommand("K6 Version Check", ["k6", "version"]);
    console.log("✅ K6 is available for load testing");
  } catch {
    console.log("⚠️  K6 not found - skipping external load tests");
    console.log("   Install K6: https://k6.io/docs/get-started/installation/");
  }
  
  console.log("✅ Prerequisites check completed");
}

async function runBenchmarkTests(): Promise<TestResult> {
  return await runCommand(
    "Deno Benchmarks",
    ["deno", "bench", "--json", "tests/performance/basic-benchmark.ts"],
    { cwd: Deno.cwd() }
  );
}

async function runMemoryTests(): Promise<TestResult> {
  return await runCommand(
    "Memory Tests",
    ["deno", "run", "--allow-all", "--v8-flags=--expose-gc", "tests/performance/simple-memory-test.ts"],
    { cwd: Deno.cwd() }
  );
}

async function runLoadTests(baseUrl: string): Promise<TestResult> {
  // Check if service is running
  try {
    const healthCheck = await fetch(`${baseUrl}/health`);
    if (!healthCheck.ok) {
      throw new Error(`Service not healthy: ${healthCheck.status}`);
    }
  } catch (error) {
    return {
      name: "K6 Load Tests",
      success: false,
      duration: 0,
      output: "",
      error: `Service not available at ${baseUrl}: ${error.message}`,
    };
  }
  
  return await runCommand(
    "K6 Load Tests",
    ["k6", "run", "tests/performance/k6-load-test.js"],
    { env: { BASE_URL: baseUrl } }
  );
}

async function runSpikeTests(baseUrl: string): Promise<TestResult> {
  return await runCommand(
    "K6 Spike Tests", 
    ["k6", "run", "tests/performance/k6-spike-test.js"],
    { env: { BASE_URL: baseUrl } }
  );
}

async function generateReport(results: TestResult[]): Promise<PerformanceReport> {
  const denoVersionOutput = await runCommand("Get Deno Version", ["deno", "--version"]);
  const denoVersion = denoVersionOutput.output.match(/deno (\d+\.\d+\.\d+)/)?.[1] || "unknown";
  
  const report: PerformanceReport = {
    timestamp: new Date().toISOString(),
    environment: {
      deno: denoVersion,
      os: Deno.build.os,
      arch: Deno.build.arch,
    },
    tests: results,
    summary: {
      total: results.length,
      passed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      totalDuration: results.reduce((sum, r) => sum + r.duration, 0),
    },
  };
  
  return report;
}

async function saveReport(report: PerformanceReport, outputFile: string): Promise<void> {
  const reportJson = JSON.stringify(report, null, 2);
  await Deno.writeTextFile(outputFile, reportJson);
  console.log(`📄 Report saved to ${outputFile}`);
}

function printSummary(report: PerformanceReport): void {
  console.log("\n" + "=".repeat(60));
  console.log("📊 PERFORMANCE TEST SUMMARY");
  console.log("=".repeat(60));
  
  console.log(`\n🔧 Environment:`);
  console.log(`   Deno: ${report.environment.deno}`);
  console.log(`   OS: ${report.environment.os}`);
  console.log(`   Architecture: ${report.environment.arch}`);
  console.log(`   Timestamp: ${report.timestamp}`);
  
  console.log(`\n📈 Results:`);
  console.log(`   Total tests: ${report.summary.total}`);
  console.log(`   Passed: ${report.summary.passed} ✅`);
  console.log(`   Failed: ${report.summary.failed} ${report.summary.failed > 0 ? '❌' : '✅'}`);
  console.log(`   Total duration: ${(report.summary.totalDuration / 1000).toFixed(2)}s`);
  
  console.log(`\n📋 Test Details:`);
  for (const test of report.tests) {
    const status = test.success ? "✅" : "❌";
    const duration = (test.duration / 1000).toFixed(2);
    console.log(`   ${status} ${test.name} (${duration}s)`);
    
    if (!test.success && test.error) {
      console.log(`      Error: ${test.error}`);
    }
  }
  
  if (report.summary.failed === 0) {
    console.log(`\n🎉 All performance tests passed!`);
  } else {
    console.log(`\n⚠️  ${report.summary.failed} test(s) failed. Check details above.`);
  }
}

async function main() {
  const args = parse(Deno.args, {
    string: ["url", "output"],
    boolean: ["help", "skip-load", "skip-memory", "skip-bench"],
    default: {
      url: "http://localhost:8000",
      output: "performance-report.json",
    },
  });
  
  if (args.help) {
    console.log(`
🚀 Performance Testing Runner for EU-USA Data Pipeline

Usage: deno run --allow-all scripts/run-performance-tests.ts [options]

Options:
  --url <url>        Base URL for load testing (default: http://localhost:8000)
  --output <file>    Output file for JSON report (default: performance-report.json)
  --skip-load        Skip K6 load tests
  --skip-memory      Skip memory tests  
  --skip-bench       Skip Deno benchmarks
  --help             Show this help

Examples:
  # Run all tests against local server
  deno run --allow-all scripts/run-performance-tests.ts
  
  # Run against staging server
  deno run --allow-all scripts/run-performance-tests.ts --url https://data-pipelines-staging.deno.dev
  
  # Skip load tests (when service is not running)
  deno run --allow-all scripts/run-performance-tests.ts --skip-load
    `);
    return;
  }
  
  console.log("🚀 Starting Performance Test Suite");
  console.log(`Target URL: ${args.url}`);
  console.log(`Report file: ${args.output}`);
  
  try {
    await checkPrerequisites();
    
    const results: TestResult[] = [];
    
    // Run Deno benchmarks
    if (!args["skip-bench"]) {
      results.push(await runBenchmarkTests());
    } else {
      console.log("⏭️  Skipping Deno benchmarks");
    }
    
    // Run memory tests
    if (!args["skip-memory"]) {
      results.push(await runMemoryTests());
    } else {
      console.log("⏭️  Skipping memory tests");
    }
    
    // Run load tests if not skipped and k6 is available
    if (!args["skip-load"]) {
      try {
        await runCommand("K6 Availability Check", ["k6", "version"]);
        results.push(await runLoadTests(args.url));
        results.push(await runSpikeTests(args.url));
      } catch {
        console.log("⏭️  Skipping K6 tests (k6 not available)");
      }
    } else {
      console.log("⏭️  Skipping load tests");
    }
    
    // Generate and save report
    const report = await generateReport(results);
    await saveReport(report, args.output);
    
    // Print summary
    printSummary(report);
    
    // Exit with appropriate code
    if (report.summary.failed > 0) {
      console.log("\n❌ Some tests failed");
      Deno.exit(1);
    } else {
      console.log("\n✅ All tests passed");
      Deno.exit(0);
    }
    
  } catch (error) {
    console.error("❌ Performance test runner failed:", error.message);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}