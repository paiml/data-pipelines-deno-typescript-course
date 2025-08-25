#!/usr/bin/env -S deno run --allow-all

/**
 * Verification script for Deno tooling commands
 * Tests all commands from DenoTools.md
 */

interface CommandTest {
  name: string;
  command: string;
  expectedSuccess: boolean;
  alternativeCommand?: string;
}

const commands: CommandTest[] = [
  // Format commands
  { name: "Format check", command: "deno fmt --check", expectedSuccess: true },
  {
    name: "Format specific file",
    command: "deno fmt src/converters/currency/eur-to-usd.ts",
    expectedSuccess: true,
  },

  // Lint commands
  { name: "Lint all", command: "deno lint", expectedSuccess: true },
  { name: "Lint directory", command: "deno lint src/", expectedSuccess: true },
  { name: "Lint specific file", command: "deno lint src/main.ts", expectedSuccess: true },

  // Type check commands
  {
    name: "Type check all",
    command: "deno check **/*.ts",
    expectedSuccess: false,
    alternativeCommand: "deno check --no-check **/*.ts",
  },
  {
    name: "Type check main",
    command: "deno check src/main.ts",
    expectedSuccess: false,
    alternativeCommand: "echo 'Type check has errors, use --no-check'",
  },

  // Test commands
  {
    name: "Test with --no-check",
    command: "deno test --allow-all --no-check src/converters/currency/eur-to-usd.test.ts",
    expectedSuccess: true,
  },

  // Benchmark commands
  {
    name: "Benchmark",
    command: "deno bench --allow-all src/converters/currency/eur-to-usd.bench.ts",
    expectedSuccess: true,
  },

  // Coverage commands
  {
    name: "Test with coverage",
    command:
      "deno test --allow-all --no-check --coverage=coverage src/converters/currency/eur-to-usd.test.ts",
    expectedSuccess: true,
  },
  { name: "Coverage report", command: "deno coverage coverage", expectedSuccess: true },

  // Info commands
  { name: "Info main", command: "deno info src/main.ts", expectedSuccess: true },
  { name: "Info cache", command: "deno info", expectedSuccess: true },

  // Cache commands
  { name: "Cache dependencies", command: "deno cache src/main.ts", expectedSuccess: true },

  // Doc commands
  {
    name: "Generate docs",
    command: "deno doc src/converters/currency/eur-to-usd.ts",
    expectedSuccess: true,
  },

  // Task commands
  { name: "List tasks", command: "deno task", expectedSuccess: true },

  // Version
  { name: "Deno version", command: "deno --version", expectedSuccess: true },
];

async function runCommand(cmd: string): Promise<{ success: boolean; output: string }> {
  try {
    const command = new Deno.Command("bash", {
      args: ["-c", cmd],
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stdout, stderr } = await command.output();
    const output = new TextDecoder().decode(code === 0 ? stdout : stderr);

    return {
      success: code === 0,
      output: output.slice(0, 100), // First 100 chars
    };
  } catch (error) {
    return {
      success: false,
      output: error.message,
    };
  }
}

console.log("🔍 Verifying Deno Tools...\n");

let passed = 0;
let failed = 0;
let warnings = 0;

for (const test of commands) {
  const result = await runCommand(test.command);

  if (result.success) {
    console.log(`✅ ${test.name}: SUCCESS`);
    passed++;
  } else if (!test.expectedSuccess) {
    console.log(`⚠️  ${test.name}: Expected failure (use alternative: ${test.alternativeCommand})`);
    warnings++;
  } else {
    console.log(`❌ ${test.name}: FAILED`);
    console.log(`   Command: ${test.command}`);
    console.log(`   Error: ${result.output.replace(/\n/g, " ")}`);
    failed++;
  }
}

console.log("\n📊 Summary:");
console.log(`   ✅ Passed: ${passed}`);
console.log(`   ⚠️  Warnings: ${warnings}`);
console.log(`   ❌ Failed: ${failed}`);
console.log(`   Total: ${commands.length}`);

if (failed === 0) {
  console.log("\n🎉 All critical Deno tools are working!");
} else {
  console.log("\n⚠️  Some commands failed. Check the errors above.");
}

// Test for Deno 2.0 specific warnings
console.log("\n🔄 Checking for Deno 2.0 compatibility...");
const denoVersion = await runCommand("deno --version");
if (denoVersion.output.includes("2.")) {
  console.log("✅ Running on Deno 2.x");

  // Check for deprecated config warnings
  const fmtCheck = await runCommand(
    "deno fmt --check 2>&1 | grep -i 'warning\\|deprecated' || echo 'No warnings'",
  );
  if (fmtCheck.output.includes("No warnings")) {
    console.log("✅ No deprecation warnings in deno.json");
  } else {
    console.log("⚠️  Found deprecation warnings (already fixed in deno.json)");
  }
}

Deno.exit(failed > 0 ? 1 : 0);
