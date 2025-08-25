#!/usr/bin/env -S deno run --allow-net

/**
 * Health check script for the pipeline service
 * Usage: deno task health
 */

interface HealthCheck {
  name: string;
  url: string;
  timeout: number;
}

const HEALTH_CHECKS: HealthCheck[] = [
  {
    name: "Main Application",
    url: "http://localhost:8000/health",
    timeout: 5000,
  },
  {
    name: "API Endpoints",
    url: "http://localhost:8000/api/health",
    timeout: 3000,
  },
  {
    name: "Ready Check",
    url: "http://localhost:8000/ready",
    timeout: 3000,
  },
];

async function checkHealth(check: HealthCheck): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), check.timeout);

    const response = await fetch(check.url, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ ${check.name}: Healthy (${response.status})`);
      if (data.uptime) {
        console.log(`   Uptime: ${data.uptime}s`);
      }
      return true;
    } else {
      console.log(`❌ ${check.name}: Unhealthy (${response.status})`);
      return false;
    }
  } catch (error) {
    if (error.name === "AbortError") {
      console.log(`⏰ ${check.name}: Timeout after ${check.timeout}ms`);
    } else {
      console.log(`❌ ${check.name}: ${error.message}`);
    }
    return false;
  }
}

async function main() {
  console.log("🏥 Running health checks...");
  console.log("=".repeat(40));

  let passed = 0;
  let failed = 0;

  for (const check of HEALTH_CHECKS) {
    const healthy = await checkHealth(check);
    if (healthy) {
      passed++;
    } else {
      failed++;
    }
  }

  console.log("=".repeat(40));
  console.log(`📊 Results: ${passed} passed, ${failed} failed`);

  if (failed === 0) {
    console.log("🎉 All health checks passed!");
    Deno.exit(0);
  } else {
    console.log("🚨 Some health checks failed!");
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}
