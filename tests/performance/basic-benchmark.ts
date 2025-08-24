// Basic Performance Benchmarks for EU-USA Data Pipeline
// Simple benchmarks that test core JavaScript/TypeScript performance

// Benchmark: JSON Processing Performance
Deno.bench("JSON - Parse/Stringify", { group: "serialization" }, () => {
  const testData = {
    original: { amount: 100.50, currency: "EUR" },
    converted: { amount: 110.55, currency: "USD" },
    exchangeRate: 1.1,
    timestamp: "2025-08-24T10:00:00Z",
    metadata: {
      source: "cache",
      processingTime: 15,
      requestId: "req_abc123",
    }
  };
  
  for (let i = 0; i < 1000; i++) {
    const serialized = JSON.stringify(testData);
    JSON.parse(serialized);
  }
});

// Benchmark: Array Processing
Deno.bench("Array - Processing Large Dataset", { group: "data-processing" }, () => {
  const data = Array.from({ length: 10000 }, (_, i) => ({
    id: i,
    amount: Math.random() * 1000,
    timestamp: Date.now(),
  }));
  
  // Filter, map, reduce operations
  const processed = data
    .filter(item => item.amount > 100)
    .map(item => ({ ...item, converted: item.amount * 1.1 }))
    .reduce((acc, item) => acc + item.converted, 0);
    
  if (processed < 0) throw new Error("Invalid result"); // Prevent optimization
});

// Benchmark: String Processing
Deno.bench("String - Format Conversion", { group: "string-processing" }, () => {
  const dates = [
    "24/08/2025", "15/12/2024", "01/01/2025", "31/12/2025",
    "05/06/2024", "28/02/2025", "17/09/2024", "03/11/2025"
  ];
  
  for (let i = 0; i < 1000; i++) {
    for (const date of dates) {
      // Convert DD/MM/YYYY to MM/DD/YYYY
      const parts = date.split('/');
      const converted = `${parts[1]}/${parts[0]}/${parts[2]}`;
      if (!converted) throw new Error("Conversion failed"); // Prevent optimization
    }
  }
});

// Benchmark: Mathematical Operations
Deno.bench("Math - Currency Conversion", { group: "math" }, () => {
  const amounts = Array.from({ length: 1000 }, () => Math.random() * 1000);
  const exchangeRate = 1.1;
  
  let total = 0;
  for (const amount of amounts) {
    // Simulate precision handling for currency
    const converted = Math.round((amount * exchangeRate) * 100) / 100;
    total += converted;
  }
  
  if (total < 0) throw new Error("Invalid total"); // Prevent optimization
});

// Benchmark: Object Creation and Manipulation
Deno.bench("Object - Creation and Cloning", { group: "object-ops" }, () => {
  const baseObject = {
    id: "test-123",
    data: {
      amount: 100,
      currency: "EUR",
      rates: { USD: 1.1, GBP: 0.9 },
      metadata: { source: "api", timestamp: Date.now() }
    }
  };
  
  for (let i = 0; i < 1000; i++) {
    // Deep clone using JSON (common pattern)
    const cloned = JSON.parse(JSON.stringify(baseObject));
    cloned.data.amount = Math.random() * 1000;
    cloned.id = `test-${i}`;
    
    if (!cloned.id) throw new Error("Clone failed"); // Prevent optimization
  }
});

// Benchmark: Map and Set Operations
Deno.bench("Collections - Map/Set Operations", { group: "collections" }, () => {
  const map = new Map<string, number>();
  const set = new Set<string>();
  
  // Populate collections
  for (let i = 0; i < 1000; i++) {
    const key = `key-${i}`;
    map.set(key, Math.random() * 1000);
    set.add(key);
  }
  
  // Access and modify
  for (let i = 0; i < 1000; i++) {
    const key = `key-${i % 100}`;
    const value = map.get(key);
    const exists = set.has(key);
    
    if (value && exists) {
      map.set(key, value * 1.1);
    }
  }
});

// Benchmark: Promise and Async Operations
Deno.bench("Async - Promise Processing", { group: "async" }, async () => {
  const tasks = Array.from({ length: 100 }, (_, i) =>
    Promise.resolve(Math.random() * 100).then(value => ({
      id: i,
      value,
      processed: Date.now()
    }))
  );
  
  const results = await Promise.all(tasks);
  if (results.length !== 100) throw new Error("Task failed"); // Prevent optimization
});

// Benchmark: Error Handling Performance
Deno.bench("Error - Try/Catch Performance", { group: "error-handling" }, () => {
  for (let i = 0; i < 1000; i++) {
    try {
      if (i % 100 === 0) {
        throw new Error("Test error");
      }
      const result = Math.sqrt(i);
      if (result < 0) throw new Error("Invalid result");
    } catch (error) {
      // Handle error - most iterations will not throw
      const message = error instanceof Error ? error.message : "Unknown error";
      if (!message) throw new Error("Error handling failed");
    }
  }
});

// Benchmark: Regex Performance
Deno.bench("Regex - Pattern Matching", { group: "regex" }, () => {
  const patterns = [
    /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/, // Date pattern
    /^[\w\.-]+@[\w\.-]+\.\w+$/, // Email pattern
    /^\+?[\d\s\-\(\)]+$/, // Phone pattern
    /^[A-Z]{2,3}$/, // Currency code pattern
  ];
  
  const testStrings = [
    "24/08/2025", "test@example.com", "+1-555-0123", "USD",
    "15-12-2024", "user@domain.co.uk", "(555) 123-4567", "EUR",
    "invalid-date", "not-an-email", "not-a-phone", "INVALID",
  ];
  
  for (let i = 0; i < 1000; i++) {
    for (const str of testStrings) {
      for (const pattern of patterns) {
        const matches = pattern.test(str);
        if (typeof matches !== 'boolean') throw new Error("Pattern test failed");
      }
    }
  }
});

console.log("🚀 Basic performance benchmarks completed");
console.log("These benchmarks test core JavaScript/TypeScript operations");
console.log("Run with: deno bench tests/performance/basic-benchmark.ts");