# 🚀 Performance Testing Guide - EU to USA Data Pipeline

## Overview

This guide covers the comprehensive performance testing suite for the EU to USA Data Pipeline, including load testing, benchmarking, memory analysis, and performance monitoring.

## Test Types

### 1. Load Testing (K6)
- **Purpose**: Test system behavior under expected load conditions
- **Tool**: K6 JavaScript testing framework
- **Metrics**: Response time, throughput, error rates
- **Targets**: P50 < 50ms, P95 < 100ms, P99 < 200ms, >1000 RPS

### 2. Spike Testing (K6)  
- **Purpose**: Test system resilience under sudden traffic spikes
- **Scenarios**: 10x and 20x traffic increases
- **Focus**: Circuit breaker behavior, graceful degradation

### 3. Benchmark Testing (Deno)
- **Purpose**: Measure internal component performance
- **Tool**: Deno's built-in benchmark framework
- **Coverage**: Converters, cache, worker pools, resilience patterns

### 4. Memory Testing (Deno)
- **Purpose**: Detect memory leaks and analyze usage patterns
- **Duration**: Short bursts + 2-minute continuous monitoring
- **Thresholds**: <50% growth, acceptable leak rates

## Running Performance Tests

### Prerequisites

```bash
# Install K6 (for load testing)
# macOS
brew install k6

# Linux
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Windows
choco install k6
```

### Quick Start

```bash
# Run all performance tests
deno task test:performance

# Run individual test types
deno task bench:performance        # Deno benchmarks
deno task test:memory             # Memory leak testing

# Run against different environments
deno task test:performance:staging     # Staging environment
deno task test:performance:production  # Production environment

# Skip specific tests
deno run --allow-all scripts/run-performance-tests.ts --skip-load --skip-memory
```

### Manual Test Execution

#### Load Testing with K6
```bash
# Basic load test
k6 run tests/performance/k6-load-test.js

# Load test against specific URL
BASE_URL=https://your-service.deno.dev k6 run tests/performance/k6-load-test.js

# Spike testing
k6 run tests/performance/k6-spike-test.js
```

#### Benchmarking with Deno
```bash
# Run all benchmarks
deno bench tests/performance/benchmark.ts

# JSON output for CI/CD
deno bench --json tests/performance/benchmark.ts

# Specific benchmark groups
deno bench --filter="converters" tests/performance/benchmark.ts
```

#### Memory Testing
```bash
# Memory leak detection with garbage collection
deno run --allow-all --v8-flags=--expose-gc tests/performance/memory-test.ts

# Extended memory monitoring
deno run --allow-all tests/performance/memory-test.ts
```

## Performance Targets

### Service Level Objectives (SLOs)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Availability | 99.9% | Uptime monitoring |
| P50 Latency | < 50ms | Response time percentile |
| P95 Latency | < 100ms | Response time percentile |
| P99 Latency | < 200ms | Response time percentile |
| Throughput | > 1000 RPS | Requests per second |
| Error Rate | < 0.1% | Failed requests ratio |

### Component-Specific Targets

#### Currency Converter
- Single conversion: < 10ms
- Batch 100: < 100ms
- Batch 1000: < 500ms
- Cache hit ratio: > 80%

#### Unit Converter
- Single conversion: < 1ms
- Batch 1000: < 10ms
- Batch 10000: < 50ms

#### Date Converter
- Single conversion: < 1ms
- Batch 1000: < 5ms

#### Cache Manager
- Get operation: < 0.1ms
- Set operation: < 0.5ms
- Mixed operations: < 0.2ms avg

#### Circuit Breaker
- Success path: < 0.1ms overhead
- State transition: < 1ms

### Memory Targets

- Initial memory: < 50MB
- Peak memory: < 200MB
- Memory growth: < 50% over baseline
- Leak rate: < 1KB/second

## Test Scenarios

### Load Test Scenarios

#### Scenario 1: Normal Traffic Pattern
```
Stages:
- Warm up: 30s → 100 users
- Ramp up: 2m → 500 users, 2m → 1000 users  
- Sustain: 5m @ 1000 users
- Ramp down: 2m → 500 users, 1m → 0 users
```

#### Scenario 2: Spike Traffic Pattern
```
Stages:
- Baseline: 1m @ 100 users
- Gradual: 2m → 500 users
- Spike 1: 10s → 5000 users, 1m sustain
- Recovery: 1m → 500 users
- Spike 2: 10s → 10000 users, 30s sustain
- Scale down: 30s → 0 users
```

### Endpoint Weight Distribution

| Endpoint | Weight | Purpose |
|----------|--------|---------|
| `/health` | 40% | Health monitoring |
| `/metrics` | 20% | Observability |
| `/api/convert/currency` | 20% | Primary business logic |
| `/api/convert/units` | 10% | Secondary conversion |
| `/api/convert/date` | 5% | Utility conversion |
| Static endpoints | 5% | Documentation/info |

## Interpreting Results

### K6 Load Test Output
```
✓ errors................: 0.00%  ✓ 0        ✗ 1000000
✓ http_req_duration.....: avg=45.2ms  min=12ms  med=42ms  max=180ms p(95)=89ms
✓ http_reqs.............: 1000000 1666.67/s
✓ custom_latency........: avg=44.8ms  min=11ms  med=41ms  max=179ms p(95)=88ms
```

**Key Metrics:**
- `errors`: Should be < 0.1% (< 1000 failures per million requests)
- `http_req_duration p(95)`: Should be < 100ms
- `http_reqs rate`: Should be > 1000/s
- `http_req_failed`: Should be < 0.1%

### Deno Benchmark Output
```
benchmark         time (avg)        iter/s             (min … max)       p75       p99       p995
--------------    -----------    -----------    ---------------------    -------   -------   -------
Currency Single   8.94 ms/iter      111.89    (7.12 ms … 12.45 ms)   9.23 ms  11.87 ms  12.31 ms
```

**Analysis:**
- Compare against target thresholds
- Look for performance regressions
- Identify bottlenecks in slow components

### Memory Test Output
```
📊 Results:
Final memory: 52.34 MB
Memory growth: +12.45 MB (+31.2%)
Peak memory: 67.89 MB
Average memory: 58.12 MB
✅ Memory usage within acceptable limits
```

**Red Flags:**
- Growth > 50% indicates potential leaks
- Peak memory > 200MB suggests inefficient algorithms
- Continuous growth in long-running tests

## Performance Monitoring in Production

### Metrics Collection

The application exposes performance metrics at `/metrics`:

```
# Response time histogram
http_request_duration_ms_bucket{le="10"} 1000
http_request_duration_ms_bucket{le="25"} 1200
http_request_duration_ms_bucket{le="50"} 1450
http_request_duration_ms_bucket{le="100"} 1480
http_request_duration_ms_bucket{le="+Inf"} 1500

# Request rate counter  
http_requests_total{method="GET",status="200"} 1542000
http_requests_total{method="POST",status="200"} 458000

# Error rate
http_requests_total{method="GET",status="500"} 12
```

### Alerts Configuration

Critical performance alerts:
- P95 response time > 200ms (5min window)
- Request rate < 500 RPS (3min window)
- Error rate > 1% (2min window)
- Memory usage > 80% (5min window)

## Optimization Strategies

### Based on Test Results

#### High Latency
1. **Cache Optimization**: Increase cache TTL, add cache warming
2. **Database Tuning**: Add indices, optimize queries
3. **Algorithm Improvement**: Use more efficient data structures
4. **Parallel Processing**: Increase worker pool size

#### Low Throughput  
1. **Horizontal Scaling**: Add more instances
2. **Connection Pooling**: Optimize database connections
3. **Async Processing**: Move heavy operations to background
4. **CDN**: Cache static content at edge

#### Memory Issues
1. **Object Pooling**: Reuse expensive objects
2. **Stream Processing**: Process data in chunks
3. **Garbage Collection**: Tune GC parameters
4. **Memory Profiling**: Identify specific leaks

#### High Error Rates
1. **Circuit Breaker Tuning**: Adjust thresholds and timeouts
2. **Retry Policies**: Implement exponential backoff
3. **Input Validation**: Add comprehensive validation
4. **Graceful Degradation**: Implement fallback mechanisms

## Continuous Integration

### GitHub Actions Integration

```yaml
# In .github/workflows/ci.yml
- name: Performance Tests
  run: |
    deno task bench:performance
    deno task test:memory --skip-long-running
  
- name: Load Test Staging
  if: github.ref == 'refs/heads/develop'
  run: |
    deno task test:performance:staging --skip-memory
```

### Performance Budgets

Set performance budgets in CI to prevent regressions:

```typescript
// performance-budget.ts
export const PERFORMANCE_BUDGETS = {
  currencyConversion: 10, // ms
  unitConversion: 1,      // ms
  cacheGet: 0.1,         // ms
  memoryGrowth: 0.5,     // growth ratio
};
```

## Troubleshooting

### Common Issues

#### K6 Tests Failing
1. **Service not running**: Ensure local server is started
2. **Network issues**: Check firewall and DNS
3. **Rate limiting**: Verify rate limit configuration
4. **Circuit breakers open**: Check system health

#### High Memory Usage
1. **Cache size**: Review cache eviction policies
2. **Object retention**: Check for event listener leaks
3. **Worker pools**: Ensure proper termination
4. **Timers**: Clear intervals and timeouts

#### Benchmark Variations
1. **System load**: Run on dedicated test machine
2. **External dependencies**: Mock external APIs
3. **Garbage collection**: Use consistent GC settings
4. **CPU throttling**: Disable power management

### Performance Debugging

```bash
# Enable detailed V8 profiling
deno run --v8-flags=--prof --allow-all src/main.ts

# Chrome DevTools integration
deno run --inspect-brk --allow-all src/main.ts

# Memory heap snapshots
deno run --v8-flags=--heap-prof --allow-all src/main.ts
```

## Reports and Analysis

### Automated Reporting

The performance test runner generates detailed JSON reports:

```json
{
  "timestamp": "2025-08-24T10:00:00Z",
  "environment": {
    "deno": "2.0.0",
    "os": "linux",
    "arch": "x86_64"
  },
  "tests": [...],
  "summary": {
    "total": 4,
    "passed": 4,
    "failed": 0,
    "totalDuration": 45000
  }
}
```

### Dashboard Integration

Integrate with monitoring dashboards:
- **Grafana**: Import performance metrics
- **DataDog**: Custom performance dashboards  
- **New Relic**: Application performance monitoring
- **Prometheus**: Metrics collection and alerting

## Best Practices

### Test Development
- Write realistic test scenarios
- Use production-like data volumes
- Test individual components in isolation
- Include negative test cases

### Environment Management
- Use dedicated performance test environments
- Ensure consistent resource allocation
- Minimize external dependencies
- Control network conditions

### Results Analysis
- Establish baseline measurements
- Track performance trends over time
- Set up automated alerting for regressions
- Document performance characteristics

---

## Quick Reference Commands

```bash
# Complete performance test suite
deno task test:performance

# Individual test types
deno task bench:performance
deno task test:memory
k6 run tests/performance/k6-load-test.js

# Environment-specific tests
deno task test:performance:staging
deno task test:performance:production

# Custom configurations
deno run --allow-all scripts/run-performance-tests.ts \
  --url https://custom-url.com \
  --output custom-report.json \
  --skip-memory
```

**Last Updated**: August 24, 2025  
**Performance Suite Version**: 1.0.0