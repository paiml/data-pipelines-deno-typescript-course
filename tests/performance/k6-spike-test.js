// K6 Spike Testing for EU-USA Data Pipeline
// This script tests how the system handles sudden traffic spikes
// and validates graceful degradation under extreme load

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('spike_errors');
const circuitBreakerTrips = new Counter('circuit_breaker_trips');
const degradationEvents = new Counter('degradation_events');

export const options = {
  stages: [
    // Normal load baseline
    { duration: '1m', target: 100 },
    
    // Gradual increase
    { duration: '2m', target: 500 },
    
    // First spike - 10x traffic instantly
    { duration: '10s', target: 5000 },
    { duration: '1m', target: 5000 },
    
    // Recovery period
    { duration: '1m', target: 500 },
    
    // Second spike - even higher
    { duration: '10s', target: 10000 },
    { duration: '30s', target: 10000 },
    
    // Rapid scale down
    { duration: '30s', target: 0 },
  ],
  
  thresholds: {
    // More relaxed thresholds for spike testing
    'spike_errors': ['rate<0.05'],  // Allow 5% errors during spikes
    'http_req_duration': [
      'p(50)<100',    // P50 < 100ms (relaxed)
      'p(95)<500',    // P95 < 500ms (relaxed) 
      'p(99)<1000',   // P99 < 1s (relaxed)
    ],
    'http_req_failed': ['rate<0.05'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

export default function () {
  const start = Date.now();
  
  // During spike, focus on critical endpoints
  const scenarios = [
    { weight: 60, fn: () => testCriticalEndpoint('/health') },
    { weight: 30, fn: () => testBusinessEndpoint('/api/convert/currency') },
    { weight: 10, fn: () => testMonitoringEndpoint('/metrics') },
  ];
  
  const scenario = weightedChoice(scenarios);
  scenario.fn();
  
  sleep(0.05); // Shorter sleep during spike test
}

function weightedChoice(scenarios) {
  const totalWeight = scenarios.reduce((sum, s) => sum + s.weight, 0);
  const random = Math.random() * totalWeight;
  let cumulativeWeight = 0;
  
  for (const scenario of scenarios) {
    cumulativeWeight += scenario.weight;
    if (random <= cumulativeWeight) {
      return scenario;
    }
  }
  return scenarios[0];
}

function testCriticalEndpoint(endpoint) {
  const response = http.get(`${BASE_URL}${endpoint}`);
  
  const isSuccess = check(response, {
    'critical endpoint available': (r) => r.status === 200,
    'response time reasonable': (r) => r.timings.duration < 2000, // 2s max during spike
  });
  
  // Check for circuit breaker responses
  if (response.status === 503) {
    try {
      const body = JSON.parse(response.body);
      if (body.error && body.error.includes('Circuit breaker')) {
        circuitBreakerTrips.add(1);
      }
    } catch {
      // Non-JSON 503 response
    }
  }
  
  errorRate.add(!isSuccess);
}

function testBusinessEndpoint(endpoint) {
  const payload = {
    amount: 100,
    from: 'EUR',
    to: 'USD'
  };
  
  const response = http.post(
    `${BASE_URL}${endpoint}`,
    JSON.stringify(payload),
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: '5s', // Longer timeout for business endpoints
    }
  );
  
  const isSuccess = check(response, {
    'business endpoint responds': (r) => r.status === 200 || r.status === 503,
    'graceful degradation active': (r) => {
      if (r.status === 503) {
        try {
          const body = JSON.parse(r.body);
          return body.error && (
            body.error.includes('temporarily unavailable') ||
            body.error.includes('degraded')
          );
        } catch {
          return false;
        }
      }
      return true;
    },
  });
  
  // Track degradation events
  if (response.status === 503) {
    degradationEvents.add(1);
  }
  
  errorRate.add(!isSuccess);
}

function testMonitoringEndpoint(endpoint) {
  const response = http.get(`${BASE_URL}${endpoint}`, {
    timeout: '2s', // Short timeout for monitoring
  });
  
  const isSuccess = check(response, {
    'monitoring endpoint available': (r) => r.status === 200,
  });
  
  errorRate.add(!isSuccess);
}

export function setup() {
  console.log('Starting spike test for EU-USA Data Pipeline');
  console.log('This test will generate extreme load to validate system resilience');
  
  // Verify baseline health
  const health = http.get(`${BASE_URL}/health`);
  if (health.status !== 200) {
    throw new Error('Service not healthy before spike test');
  }
  
  console.log('Baseline health check passed, starting spike test...');
}

export function teardown(data) {
  console.log('Spike test completed');
  console.log('Review metrics for circuit breaker trips and degradation events');
  
  // Allow some time for system to stabilize
  sleep(5);
  
  // Final health check
  const health = http.get(`${BASE_URL}/health`);
  console.log(`Final health status: ${health.status}`);
}