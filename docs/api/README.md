# 📚 API Documentation - EU to USA Data Pipeline

## Overview

The EU to USA Data Pipeline provides RESTful APIs for converting various data formats from European standards to USA standards. The service is built with Deno and TypeScript, featuring comprehensive resilience patterns and monitoring.

## Base URL

- **Production**: `https://data-pipelines-prod.deno.dev`
- **Staging**: `https://data-pipelines-staging.deno.dev`
- **Local Development**: `http://localhost:8000`

## Authentication

Currently, the API endpoints are publicly accessible. Authentication will be added in future versions.

## Core Endpoints

### Health & Monitoring

#### GET /health
Returns the service health status.

**Response**: `200 OK`
```json
{
  "status": "healthy",
  "timestamp": "2025-08-24T10:00:00Z",
  "version": "1.0.0",
  "environment": "production",
  "uptime": 86400.5,
  "services": {
    "cache": "available",
    "metrics": "available",
    "circuitBreakers": "available",
    "dlq": "available",
    "degradation": "available"
  }
}
```

#### GET /ready
Kubernetes-style readiness probe.

**Response**: `200 OK` (ready) / `503 Service Unavailable` (not ready)
```json
{
  "ready": true,
  "timestamp": "2025-08-24T10:00:00Z",
  "checks": {
    "cache": "ready",
    "metrics": "ready",
    "resilience": "ready"
  }
}
```

#### GET /metrics
Prometheus-compatible metrics endpoint.

**Response**: `200 OK`
**Content-Type**: `text/plain; version=0.0.4`

```
# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",status="200"} 1542

# HELP http_request_duration_ms HTTP request duration in milliseconds
# TYPE http_request_duration_ms histogram
http_request_duration_ms_bucket{le="10"} 1000
http_request_duration_ms_bucket{le="25"} 1200
...
```

#### GET /version
Service version and build information.

**Response**: `200 OK`
```json
{
  "version": "1.0.0",
  "build": "abc123def456",
  "commit": "a1b2c3d4e5f6",
  "buildTime": "2025-08-24T08:00:00Z",
  "deno": "2.0.0",
  "typescript": "5.6.0"
}
```

### Service Information

#### GET /
Service information and available endpoints.

**Response**: `200 OK`
```json
{
  "service": "EU to USA Data Pipeline",
  "version": "1.0.0",
  "endpoints": {
    "health": "/health",
    "ready": "/ready",
    "metrics": "/metrics",
    "version": "/version",
    "docs": "/docs"
  },
  "status": "operational"
}
```

#### GET /docs
Comprehensive service documentation.

**Response**: `200 OK`
```json
{
  "service": "EU to USA Data Pipeline",
  "description": "Production-grade data pipeline for converting EU data formats to USA standards",
  "features": [
    "Currency conversion (EUR → USD)",
    "Unit conversion (Metric → Imperial)",
    "Date format conversion (DD/MM/YYYY → MM/DD/YYYY)",
    "Number format conversion (European → US)",
    "Address format conversion",
    "Phone number conversion",
    "Tax calculation (VAT → Sales Tax)",
    "Privacy compliance (GDPR → CCPA)"
  ],
  "resilience": [
    "Circuit breakers",
    "Retry policies with exponential backoff",
    "Dead letter queues", 
    "Graceful degradation"
  ],
  "performance": [
    "Multi-tier caching (L1 memory + L2 Redis)",
    "Parallel processing with worker pools",
    "Memory optimization and stream processing",
    "Real-time monitoring and alerting"
  ]
}
```

## Data Conversion Endpoints

> **Note**: Individual conversion endpoints are available as part of the converters module. Examples of planned endpoints:

### Currency Conversion

#### POST /api/convert/currency
Convert EUR to USD with real-time exchange rates.

**Request Body**:
```json
{
  "amount": 100.50,
  "from": "EUR",
  "to": "USD",
  "date": "2025-08-24" // Optional, defaults to today
}
```

**Response**: `200 OK`
```json
{
  "original": {
    "amount": 100.50,
    "currency": "EUR"
  },
  "converted": {
    "amount": 110.55,
    "currency": "USD"
  },
  "exchangeRate": 1.1,
  "timestamp": "2025-08-24T10:00:00Z",
  "source": "cache" // or "api"
}
```

### Unit Conversion

#### POST /api/convert/units
Convert metric units to imperial.

**Request Body**:
```json
{
  "value": 100,
  "fromUnit": "km",
  "toUnit": "miles"
}
```

**Response**: `200 OK`
```json
{
  "original": {
    "value": 100,
    "unit": "km"
  },
  "converted": {
    "value": 62.14,
    "unit": "miles"
  },
  "conversionFactor": 0.621371,
  "timestamp": "2025-08-24T10:00:00Z"
}
```

### Date Format Conversion

#### POST /api/convert/date
Convert European date format to US format.

**Request Body**:
```json
{
  "date": "24/08/2025",
  "fromFormat": "DD/MM/YYYY",
  "toFormat": "MM/DD/YYYY"
}
```

**Response**: `200 OK`
```json
{
  "original": {
    "date": "24/08/2025",
    "format": "DD/MM/YYYY"
  },
  "converted": {
    "date": "08/24/2025",
    "format": "MM/DD/YYYY"
  },
  "parsedDate": "2025-08-24T00:00:00Z",
  "timestamp": "2025-08-24T10:00:00Z"
}
```

## Error Handling

All API endpoints follow consistent error response patterns:

### Error Response Format
```json
{
  "error": "Error Type",
  "message": "Detailed error description",
  "timestamp": "2025-08-24T10:00:00Z",
  "requestId": "req_abc123def456",
  "path": "/api/convert/currency",
  "method": "POST"
}
```

### HTTP Status Codes

| Code | Description | Example |
|------|-------------|---------|
| `200` | Success | Request completed successfully |
| `400` | Bad Request | Invalid input parameters |
| `401` | Unauthorized | Authentication required |
| `403` | Forbidden | Access denied |
| `404` | Not Found | Endpoint or resource not found |
| `422` | Unprocessable Entity | Validation errors |
| `429` | Too Many Requests | Rate limit exceeded |
| `500` | Internal Server Error | Unexpected server error |
| `502` | Bad Gateway | Upstream service error |
| `503` | Service Unavailable | Service temporarily down |
| `504` | Gateway Timeout | Request timeout |

### Common Error Examples

#### Validation Error (400)
```json
{
  "error": "Validation Error",
  "message": "Invalid currency code: XYZ",
  "timestamp": "2025-08-24T10:00:00Z",
  "requestId": "req_validation_123",
  "details": {
    "field": "currency",
    "value": "XYZ",
    "allowedValues": ["EUR", "USD", "GBP"]
  }
}
```

#### Rate Limit Error (429)
```json
{
  "error": "Rate Limit Exceeded",
  "message": "Too many requests. Limit: 1000/hour",
  "timestamp": "2025-08-24T10:00:00Z",
  "requestId": "req_ratelimit_456",
  "retryAfter": 3600
}
```

#### Circuit Breaker Error (503)
```json
{
  "error": "Service Temporarily Unavailable",
  "message": "External service is currently unavailable. Circuit breaker is open.",
  "timestamp": "2025-08-24T10:00:00Z",
  "requestId": "req_circuit_789",
  "retryAfter": 60
}
```

## Rate Limiting

- **Default**: 1000 requests per hour per IP
- **Burst**: Up to 100 requests per minute
- **Headers**: Standard rate limiting headers included in responses

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1692871200
```

## Request/Response Headers

### Standard Headers

**Request Headers**:
- `Content-Type: application/json` (for POST requests)
- `Accept: application/json`
- `User-Agent: <client-info>`

**Response Headers**:
- `Content-Type: application/json`
- `X-Request-ID: <correlation-id>`
- `X-Response-Time: <duration-ms>`
- `Cache-Control: <cache-directive>`

### Correlation IDs

Every request receives a unique correlation ID for tracking and debugging:
```
X-Request-ID: req_2025-08-24_10-00-00_abc123
```

## Performance Characteristics

### Latency Targets

| Endpoint | P50 | P95 | P99 |
|----------|-----|-----|-----|
| `/health` | < 5ms | < 10ms | < 25ms |
| `/ready` | < 10ms | < 25ms | < 50ms |
| `/metrics` | < 25ms | < 50ms | < 100ms |
| Conversion APIs | < 50ms | < 100ms | < 200ms |

### Throughput

- **Sustained**: 1,000+ requests/second
- **Peak**: 10,000+ requests/second (with auto-scaling)
- **Concurrent**: 1,000+ concurrent connections

### Caching Strategy

- **L1 Cache**: In-memory cache (5-minute TTL)
- **L2 Cache**: Redis cache (1-hour TTL)
- **CDN**: Edge caching for static responses
- **Cache Headers**: Appropriate cache-control headers

## Monitoring & Observability

### Request Tracing

All requests include distributed tracing with:
- **Trace ID**: End-to-end request tracking
- **Span ID**: Individual operation tracking
- **Context**: Additional metadata and tags

### Metrics Available

- **Request Metrics**: Count, duration, status codes
- **Business Metrics**: Conversion rates, success rates
- **System Metrics**: Memory, CPU, connection counts
- **Cache Metrics**: Hit rates, miss rates, evictions

### Logging

Structured JSON logging with:
- **Level**: DEBUG, INFO, WARN, ERROR
- **Correlation ID**: Request tracking
- **Duration**: Operation timing
- **Context**: Additional request metadata

Example log entry:
```json
{
  "timestamp": "2025-08-24T10:00:00Z",
  "level": "INFO",
  "message": "Currency conversion completed",
  "requestId": "req_abc123",
  "duration": 45,
  "from": "EUR",
  "to": "USD",
  "amount": 100.50
}
```

## SDK & Integration

### Deno/TypeScript Example

```typescript
import { DataPipelineClient } from "./client.ts";

const client = new DataPipelineClient({
  baseUrl: "https://data-pipelines-prod.deno.dev",
  timeout: 5000,
});

// Health check
const health = await client.getHealth();
console.log("Service status:", health.status);

// Currency conversion  
const conversion = await client.convertCurrency({
  amount: 100,
  from: "EUR",
  to: "USD"
});
console.log(`${conversion.original.amount} EUR = ${conversion.converted.amount} USD`);
```

### cURL Examples

```bash
# Health check
curl https://data-pipelines-prod.deno.dev/health

# Currency conversion
curl -X POST https://data-pipelines-prod.deno.dev/api/convert/currency \
  -H "Content-Type: application/json" \
  -d '{"amount": 100, "from": "EUR", "to": "USD"}'

# With timeout and retry
curl --max-time 30 --retry 3 \
  https://data-pipelines-prod.deno.dev/metrics
```

## Versioning

API versioning follows semantic versioning:

- **Major**: Breaking changes (`/v2/api/...`)
- **Minor**: New features, backward compatible
- **Patch**: Bug fixes, backward compatible

Current version: `v1.0.0`

## Support

- **Documentation**: This README and `/docs` endpoint
- **Status Page**: https://status.data-pipeline.com
- **Issues**: GitHub Issues for bug reports
- **Contact**: ops-team@company.com

---

**Last Updated**: August 24, 2025
**API Version**: 1.0.0