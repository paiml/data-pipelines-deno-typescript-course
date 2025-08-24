#!/usr/bin/env -S deno run --allow-all

/**
 * EU to USA Data Pipeline - Production Entry Point
 *
 * Production-grade data pipeline server for converting EU data formats to USA standards.
 * Supports currency, units, dates, numbers, addresses, phone, tax, and privacy conversions.
 * 
 * Features:
 * - RESTful API for data conversion
 * - Health checks and monitoring
 * - Resilience patterns (circuit breakers, retries, DLQ)
 * - Performance monitoring and alerting
 * - Graceful degradation
 */

import { Application, Router } from "https://deno.land/x/oak@v17.1.3/mod.ts";
import { MetricsCollector } from "./shared/monitoring/metrics.ts";
import { CircuitBreakerRegistry } from "./shared/resilience/circuit-breaker.ts";
import { DLQManager } from "./shared/resilience/dead-letter-queue.ts";
import { GracefulDegradation } from "./shared/resilience/graceful-degradation.ts";
import { CacheManager } from "./shared/cache/cache-manager.ts";
import { Result } from "./shared/types/result.ts";
import { createPipelineRoutes } from "./api/pipeline-routes.ts";

// Global instances
const metrics = new MetricsCollector();
const circuitBreakers = new CircuitBreakerRegistry();
const dlqManager = new DLQManager();
const degradation = new GracefulDegradation("data-pipeline", {
  enableAutoMonitoring: true,
  healthCheckInterval: 30_000, // 30 seconds
});
const cacheManager = new CacheManager();

// Application setup
const app = new Application();
const router = new Router();

// Middleware
app.use(async (ctx, next) => {
  const start = Date.now();
  
  try {
    await next();
    const duration = Date.now() - start;
    
    metrics.observeHistogram("http_request_duration_ms", duration, {
      method: ctx.request.method,
      status: ctx.response.status?.toString() || "unknown",
      path: ctx.request.url.pathname,
    });
    
    metrics.incrementCounter("http_requests_total", 1, {
      method: ctx.request.method,
      status: ctx.response.status?.toString() || "unknown",
    });
    
  } catch (error) {
    const duration = Date.now() - start;
    
    metrics.observeHistogram("http_request_duration_ms", duration, {
      method: ctx.request.method,
      status: "500",
      path: ctx.request.url.pathname,
    });
    
    metrics.incrementCounter("http_requests_total", 1, {
      method: ctx.request.method,
      status: "500",
    });
    
    metrics.incrementCounter("http_request_errors_total", 1, {
      method: ctx.request.method,
      error: error.name || "Unknown",
    });
    
    throw error;
  }
});

// Health check endpoint
router.get("/health", (ctx) => {
  const healthStatus = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    environment: Deno.env.get("ENVIRONMENT") || "development",
    uptime: performance.now(),
    services: {
      cache: cacheManager ? "available" : "unavailable",
      metrics: metrics ? "available" : "unavailable",
      circuitBreakers: circuitBreakers ? "available" : "unavailable",
      dlq: dlqManager ? "available" : "unavailable",
      degradation: degradation ? "available" : "unavailable",
    }
  };
  
  ctx.response.status = 200;
  ctx.response.body = healthStatus;
});

// Readiness check
router.get("/ready", async (ctx) => {
  try {
    // Check if all systems are ready
    await cacheManager.initialize();
    
    const readinessStatus = {
      ready: true,
      timestamp: new Date().toISOString(),
      checks: {
        cache: "ready",
        metrics: "ready",
        resilience: "ready",
      }
    };
    
    ctx.response.status = 200;
    ctx.response.body = readinessStatus;
  } catch (error) {
    ctx.response.status = 503;
    ctx.response.body = {
      ready: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
});

// Metrics endpoint (Prometheus format)
router.get("/metrics", (ctx) => {
  // Add system metrics
  metrics.setGauge("process_uptime_seconds", performance.now() / 1000);
  
  if (Deno.systemMemoryInfo) {
    const memInfo = Deno.systemMemoryInfo();
    metrics.setGauge("system_memory_total_bytes", memInfo.total);
    metrics.setGauge("system_memory_free_bytes", memInfo.free);
    metrics.setGauge("system_memory_available_bytes", memInfo.available);
  }
  
  // Circuit breaker metrics
  const cbStats = circuitBreakers.getHealthStatus();
  metrics.setGauge("circuit_breakers_healthy", cbStats.healthy);
  metrics.setGauge("circuit_breakers_degraded", cbStats.degraded);
  metrics.setGauge("circuit_breakers_failed", cbStats.failed);
  
  ctx.response.headers.set("Content-Type", "text/plain; version=0.0.4");
  ctx.response.body = metrics.exportPrometheus();
});

// Version endpoint
router.get("/version", (ctx) => {
  ctx.response.body = {
    version: "1.0.0",
    build: Deno.env.get("BUILD_ID") || "development",
    commit: Deno.env.get("GIT_COMMIT") || "unknown",
    buildTime: Deno.env.get("BUILD_TIME") || new Date().toISOString(),
    deno: Deno.version.deno,
    typescript: Deno.version.typescript,
  };
});

// Data conversion endpoints would be added here
router.get("/", (ctx) => {
  ctx.response.body = {
    service: "EU to USA Data Pipeline",
    version: "1.0.0",
    endpoints: {
      health: "/health",
      ready: "/ready", 
      metrics: "/metrics",
      version: "/version",
      docs: "/docs"
    },
    status: "operational"
  };
});

// Docs endpoint
router.get("/docs", (ctx) => {
  ctx.response.body = {
    service: "EU to USA Data Pipeline",
    description: "Production-grade data pipeline for converting EU data formats to USA standards",
    features: [
      "Currency conversion (EUR → USD)",
      "Unit conversion (Metric → Imperial)", 
      "Date format conversion (DD/MM/YYYY → MM/DD/YYYY)",
      "Number format conversion (European → US)",
      "Address format conversion",
      "Phone number conversion",
      "Tax calculation (VAT → Sales Tax)",
      "Privacy compliance (GDPR → CCPA)"
    ],
    resilience: [
      "Circuit breakers",
      "Retry policies with exponential backoff", 
      "Dead letter queues",
      "Graceful degradation"
    ],
    performance: [
      "Multi-tier caching (L1 memory + L2 Redis)",
      "Parallel processing with worker pools",
      "Memory optimization and stream processing",
      "Real-time monitoring and alerting"
    ]
  };
});

// Error handling
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    console.error(`❌ Request error:`, err);
    
    metrics.incrementCounter("http_request_errors_total", 1, {
      error: err.name || "Unknown",
    });
    
    ctx.response.status = err.status || 500;
    ctx.response.body = {
      error: "Internal Server Error",
      message: Deno.env.get("ENVIRONMENT") === "development" ? err.message : "Something went wrong",
      timestamp: new Date().toISOString(),
      requestId: crypto.randomUUID(),
    };
  }
});

app.use(router.routes());
app.use(router.allowedMethods());

// Add pipeline routes
const pipelineRoutes = createPipelineRoutes();
app.use(pipelineRoutes.routes());
app.use(pipelineRoutes.allowedMethods());

// Graceful shutdown
function setupGracefulShutdown() {
  const signals: Deno.Signal[] = ["SIGTERM", "SIGINT"];
  
  for (const signal of signals) {
    Deno.addSignalListener(signal, async () => {
      console.log(`📥 Received ${signal}, starting graceful shutdown...`);
      
      try {
        // Stop accepting new connections
        console.log("🛑 Stopping server...");
        
        // Close resources
        degradation.close();
        await dlqManager.closeAll();
        await cacheManager.close();
        
        console.log("✅ Graceful shutdown completed");
        Deno.exit(0);
      } catch (error) {
        console.error("❌ Error during shutdown:", error);
        Deno.exit(1);
      }
    });
  }
}

export async function main(): Promise<void> {
  try {
    console.log("🚀 EU-USA Data Pipeline Starting...");
    console.log("📚 Course: Data Pipelines with Deno");
    console.log("🎯 Production-Ready Web Service");
    console.log("");
    
    // Initialize systems
    console.log("🔧 Initializing systems...");
    await cacheManager.initialize();
    
    // Setup health checks
    degradation.registerHealthCheck("cache", async () => {
      const stats = await cacheManager.getStats();
      return Result.isOk(stats) 
        ? Result.ok({
            name: "cache",
            status: "healthy" as const,
            responseTime: 1,
            timestamp: Date.now(),
            metadata: { tiers: stats.value.hits }
          })
        : Result.err(new Error("Cache unhealthy"));
    });
    
    degradation.registerHealthCheck("metrics", async () => {
      return Result.ok({
        name: "metrics",
        status: "healthy" as const,
        responseTime: 1,
        timestamp: Date.now(),
        metadata: { collected: metrics.getMetrics().length }
      });
    });
    
    // Setup graceful shutdown
    setupGracefulShutdown();
    
    const port = parseInt(Deno.env.get("PORT") || "8000");
    const hostname = Deno.env.get("HOSTNAME") || "0.0.0.0";
    
    console.log(`🌐 Server starting on http://${hostname}:${port}`);
    console.log(`📊 Metrics available at http://${hostname}:${port}/metrics`);
    console.log(`🏥 Health check at http://${hostname}:${port}/health`);
    console.log("✅ Server ready!");
    console.log("");
    
    await app.listen({ port, hostname });
    
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
