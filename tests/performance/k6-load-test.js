// K6 Load Testing for EU-USA Data Pipeline
// This script validates performance SLOs:
// - P50 latency: < 50ms
// - P95 latency: < 100ms  
// - P99 latency: < 200ms
// - Throughput: > 1000 RPS
// - Error rate: < 0.1%

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const customLatency = new Trend('custom_latency');

// Test configuration
export const options = {
  stages: [
    // Warm up
    { duration: '30s', target: 100 },
    
    // Ramp up to target load
    { duration: '2m', target: 500 },
    { duration: '2m', target: 1000 },
    
    // Sustain peak load
    { duration: '5m', target: 1000 },
    
    // Spike test
    { duration: '1m', target: 2000 },
    { duration: '1m', target: 2000 },
    
    // Ramp down
    { duration: '2m', target: 500 },
    { duration: '1m', target: 0 },
  ],
  
  thresholds: {
    // Error rate must be < 0.1%
    'errors': ['rate<0.001'],
    
    // HTTP request duration thresholds
    'http_req_duration': [
      'p(50)<50',    // P50 < 50ms
      'p(95)<100',   // P95 < 100ms
      'p(99)<200',   // P99 < 200ms
      'max<500',     // Max < 500ms
    ],
    
    // Throughput validation (requests per second)
    'http_reqs': ['rate>1000'],
    
    // Success rate
    'http_req_failed': ['rate<0.001'],
    
    // Custom latency metric
    'custom_latency': [
      'p(50)<50',
      'p(95)<100', 
      'p(99)<200',
    ],
  },
};

// Base URL from environment or default
const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

// Test data for conversions
const currencyPayloads = [
  { amount: 100, from: 'EUR', to: 'USD' },
  { amount: 250.75, from: 'EUR', to: 'USD' },
  { amount: 1000, from: 'EUR', to: 'USD' },
];

const unitPayloads = [
  { value: 100, fromUnit: 'km', toUnit: 'miles' },
  { value: 75.5, fromUnit: 'kg', toUnit: 'lbs' },
  { value: 25, fromUnit: 'celsius', toUnit: 'fahrenheit' },
];

const datePayloads = [
  { date: '24/08/2025', fromFormat: 'DD/MM/YYYY', toFormat: 'MM/DD/YYYY' },
  { date: '15/12/2025', fromFormat: 'DD/MM/YYYY', toFormat: 'MM/DD/YYYY' },
];

export default function () {
  const testScenarios = [
    // Health check - highest frequency
    { weight: 40, fn: testHealthEndpoint },
    
    // Metrics endpoint - frequent monitoring
    { weight: 20, fn: testMetricsEndpoint },
    
    // Currency conversion - main business logic
    { weight: 20, fn: testCurrencyConversion },
    
    // Unit conversion
    { weight: 10, fn: testUnitConversion },
    
    // Date conversion
    { weight: 5, fn: testDateConversion },
    
    // Version/docs endpoints
    { weight: 5, fn: testStaticEndpoints },
  ];

  // Weighted random selection of test scenario
  const totalWeight = testScenarios.reduce((sum, scenario) => sum + scenario.weight, 0);
  const random = Math.random() * totalWeight;
  let cumulativeWeight = 0;
  
  for (const scenario of testScenarios) {
    cumulativeWeight += scenario.weight;
    if (random <= cumulativeWeight) {
      scenario.fn();
      break;
    }
  }

  // Small pause between iterations
  sleep(0.1);
}

function testHealthEndpoint() {
  const start = Date.now();
  const response = http.get(`${BASE_URL}/health`);
  const duration = Date.now() - start;
  
  const isSuccess = check(response, {
    'health status is 200': (r) => r.status === 200,
    'health response has status field': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.status === 'healthy';
      } catch {
        return false;
      }
    },
    'health response time < 25ms': () => duration < 25,
  });
  
  errorRate.add(!isSuccess);
  customLatency.add(duration);
}

function testMetricsEndpoint() {
  const start = Date.now();
  const response = http.get(`${BASE_URL}/metrics`);
  const duration = Date.now() - start;
  
  const isSuccess = check(response, {
    'metrics status is 200': (r) => r.status === 200,
    'metrics response is prometheus format': (r) => {
      return r.body.includes('# HELP') && r.body.includes('# TYPE');
    },
    'metrics response time < 100ms': () => duration < 100,
  });
  
  errorRate.add(!isSuccess);
  customLatency.add(duration);
}

function testCurrencyConversion() {
  const payload = currencyPayloads[Math.floor(Math.random() * currencyPayloads.length)];
  const start = Date.now();
  
  const response = http.post(
    `${BASE_URL}/api/convert/currency`,
    JSON.stringify(payload),
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
  
  const duration = Date.now() - start;
  
  const isSuccess = check(response, {
    'currency conversion status is 200': (r) => r.status === 200,
    'currency conversion has valid response': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.original && body.converted && body.exchangeRate;
      } catch {
        return false;
      }
    },
    'currency conversion response time < 200ms': () => duration < 200,
  });
  
  errorRate.add(!isSuccess);
  customLatency.add(duration);
}

function testUnitConversion() {
  const payload = unitPayloads[Math.floor(Math.random() * unitPayloads.length)];
  const start = Date.now();
  
  const response = http.post(
    `${BASE_URL}/api/convert/units`,
    JSON.stringify(payload),
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
  
  const duration = Date.now() - start;
  
  const isSuccess = check(response, {
    'unit conversion status is 200': (r) => r.status === 200,
    'unit conversion has valid response': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.original && body.converted && body.conversionFactor;
      } catch {
        return false;
      }
    },
    'unit conversion response time < 200ms': () => duration < 200,
  });
  
  errorRate.add(!isSuccess);
  customLatency.add(duration);
}

function testDateConversion() {
  const payload = datePayloads[Math.floor(Math.random() * datePayloads.length)];
  const start = Date.now();
  
  const response = http.post(
    `${BASE_URL}/api/convert/date`,
    JSON.stringify(payload),
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
  
  const duration = Date.now() - start;
  
  const isSuccess = check(response, {
    'date conversion status is 200': (r) => r.status === 200,
    'date conversion has valid response': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.original && body.converted;
      } catch {
        return false;
      }
    },
    'date conversion response time < 200ms': () => duration < 200,
  });
  
  errorRate.add(!isSuccess);
  customLatency.add(duration);
}

function testStaticEndpoints() {
  const endpoints = ['/version', '/docs', '/', '/ready'];
  const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
  
  const start = Date.now();
  const response = http.get(`${BASE_URL}${endpoint}`);
  const duration = Date.now() - start;
  
  const isSuccess = check(response, {
    'static endpoint status is 200': (r) => r.status === 200,
    'static endpoint response time < 50ms': () => duration < 50,
  });
  
  errorRate.add(!isSuccess);
  customLatency.add(duration);
}

// Test lifecycle hooks
export function setup() {
  console.log('Starting load test for EU-USA Data Pipeline');
  console.log(`Target URL: ${BASE_URL}`);
  
  // Verify service is available before starting test
  const healthCheck = http.get(`${BASE_URL}/health`);
  if (healthCheck.status !== 200) {
    throw new Error(`Service not available. Health check returned: ${healthCheck.status}`);
  }
  
  console.log('Service health check passed, starting load test...');
}

export function teardown(data) {
  console.log('Load test completed successfully');
}