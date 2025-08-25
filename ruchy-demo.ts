#!/usr/bin/env -S deno run --allow-all

/**
 * Deno TypeScript Demo: Invoking Ruchy Programming Language
 * 
 * This demo shows how to integrate the Ruchy programming language
 * with Deno TypeScript applications for advanced scripting and computations.
 * 
 * Ruchy is a self-hosting programming language with comprehensive tooling.
 * See: /home/noah/src/ruchy/README.md
 */

interface RuchyResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode: number;
  executionTime: number;
}

interface RuchyCommand {
  command: string;
  args: string[];
  description: string;
}

class RuchyInvoker {
  private ruchyPath: string;

  constructor(ruchyPath = "ruchy") {
    this.ruchyPath = ruchyPath;
  }

  /**
   * Execute a ruchy command with the given arguments
   */
  async execute(subcommand: string, args: string[] = []): Promise<RuchyResult> {
    const startTime = performance.now();
    
    try {
      const command = new Deno.Command(this.ruchyPath, {
        args: [subcommand, ...args],
        stdout: "piped",
        stderr: "piped",
        cwd: Deno.cwd(),
      });

      const { code, stdout, stderr } = await command.output();
      const endTime = performance.now();

      const output = new TextDecoder().decode(stdout);
      const error = new TextDecoder().decode(stderr);

      return {
        success: code === 0,
        output: output.trim(),
        error: error ? error.trim() : undefined,
        exitCode: code,
        executionTime: endTime - startTime,
      };
    } catch (error) {
      const endTime = performance.now();
      return {
        success: false,
        output: "",
        error: `Failed to execute ruchy: ${error.message}`,
        exitCode: -1,
        executionTime: endTime - startTime,
      };
    }
  }

  /**
   * Run a ruchy script from a string
   */
  async runCode(code: string): Promise<RuchyResult> {
    // Write code to temporary file
    const tempFile = await Deno.makeTempFile({ suffix: ".ruchy" });
    
    try {
      await Deno.writeTextFile(tempFile, code);
      return await this.execute("run", [tempFile]);
    } finally {
      try {
        await Deno.remove(tempFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Execute a one-liner ruchy expression
   */
  async eval(expression: string): Promise<RuchyResult> {
    return await this.execute("-e", [expression]);
  }

  /**
   * Check syntax of ruchy code
   */
  async check(code: string): Promise<RuchyResult> {
    const tempFile = await Deno.makeTempFile({ suffix: ".ruchy" });
    
    try {
      await Deno.writeTextFile(tempFile, code);
      return await this.execute("check", [tempFile]);
    } finally {
      try {
        await Deno.remove(tempFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Get AST representation of ruchy code
   */
  async getAST(code: string, format: "json" | "pretty" = "json"): Promise<RuchyResult> {
    const tempFile = await Deno.makeTempFile({ suffix: ".ruchy" });
    
    try {
      await Deno.writeTextFile(tempFile, code);
      const args = format === "json" ? [tempFile, "--json"] : [tempFile];
      return await this.execute("ast", args);
    } finally {
      try {
        await Deno.remove(tempFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Format ruchy code
   */
  async format(code: string): Promise<RuchyResult> {
    const tempFile = await Deno.makeTempFile({ suffix: ".ruchy" });
    
    try {
      await Deno.writeTextFile(tempFile, code);
      return await this.execute("fmt", [tempFile]);
    } finally {
      try {
        await Deno.remove(tempFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Get ruchy version
   */
  async version(): Promise<RuchyResult> {
    return await this.execute("--version", []);
  }

  /**
   * Start ruchy REPL (non-blocking, returns immediately)
   */
  async startREPL(): Promise<void> {
    const command = new Deno.Command(this.ruchyPath, {
      args: ["repl"],
      stdout: "inherit",
      stderr: "inherit",
      stdin: "inherit",
    });

    const child = command.spawn();
    await child.status;
  }
}

// Demo Examples
const RUCHY_EXAMPLES = {
  "Hello World": `println("Hello from Ruchy!")`,
  
  "Fibonacci": `
fun fibonacci(n: i32) -> i32 {
    if n <= 1 {
        n
    } else {
        fibonacci(n - 1) + fibonacci(n - 2)
    }
}

println("Fibonacci sequence:")
for i in 0..10 {
    println("fib(\${i}) = \${fibonacci(i)}")
}
`,

  "List Processing": `
let numbers = [1, 2, 3, 4, 5] in
let doubled = numbers.map(|x| x * 2) in
let sum = doubled.fold(0, |acc, x| acc + x) in
println("Original: \${numbers}")
println("Doubled: \${doubled}")  
println("Sum: \${sum}")
`,

  "Currency Converter": `
// EUR to USD converter in Ruchy
fun convert_eur_to_usd(eur: f64) -> f64 {
    let exchange_rate = 1.09 in
    eur * exchange_rate
}

let amounts = [10.0, 50.0, 100.0, 250.50] in
for amount in amounts {
    let usd = convert_eur_to_usd(amount)
    println("€\${amount} = $\${usd}")
}
`,

  "Pattern Matching": `
type Option<T> = Some(T) | None

fun process_option(opt: Option<i32>) -> String {
    match opt {
        Some(value) => "Got value: \${value}",
        None => "No value present"
    }
}

println(process_option(Some(42)))
println(process_option(None))
`,

  "Error Handling": `
type Result<T, E> = Ok(T) | Err(E)

fun safe_divide(a: f64, b: f64) -> Result<f64, String> {
    if b == 0.0 {
        Err("Division by zero")
    } else {
        Ok(a / b)
    }
}

let result1 = safe_divide(10.0, 2.0)
let result2 = safe_divide(10.0, 0.0)

match result1 {
    Ok(value) => println("Result: \${value}"),
    Err(error) => println("Error: \${error}")
}

match result2 {
    Ok(value) => println("Result: \${value}"),
    Err(error) => println("Error: \${error}")
}
`,
};

/**
 * Demo function that showcases ruchy integration
 */
async function runDemo(): Promise<void> {
  console.log("🚀 Deno TypeScript × Ruchy Integration Demo");
  console.log("=" .repeat(50));
  console.log();

  const ruchy = new RuchyInvoker();

  // Check if ruchy is available
  console.log("📋 Checking Ruchy installation...");
  const version = await ruchy.version();
  if (!version.success) {
    console.error("❌ Ruchy not found. Please install with: cargo install ruchy");
    Deno.exit(1);
  }
  
  console.log(`✅ Found Ruchy: ${version.output}`);
  console.log();

  // Run demo examples
  for (const [name, code] of Object.entries(RUCHY_EXAMPLES)) {
    console.log(`🧪 Running: ${name}`);
    console.log("-".repeat(30));
    
    // Check syntax first
    const checkResult = await ruchy.check(code);
    if (!checkResult.success) {
      console.log("❌ Syntax Error:");
      console.log(checkResult.error || checkResult.output);
      continue;
    }

    // Run the code
    const result = await ruchy.runCode(code);
    
    if (result.success) {
      console.log("📤 Output:");
      console.log(result.output);
    } else {
      console.log("❌ Runtime Error:");
      console.log(result.error || result.output);
    }
    
    console.log(`⏱️  Execution time: ${result.executionTime.toFixed(2)}ms`);
    console.log();
  }

  // Demonstrate advanced features
  console.log("🔍 Advanced Features Demo");
  console.log("-".repeat(30));

  // AST Generation
  const astCode = `fun add(a: i32, b: i32) -> i32 { a + b }`;
  console.log("🌳 AST Generation:");
  const astResult = await ruchy.getAST(astCode, "json");
  if (astResult.success) {
    try {
      const ast = JSON.parse(astResult.output);
      console.log("📊 AST Structure (first 200 chars):");
      console.log(JSON.stringify(ast, null, 2).substring(0, 200) + "...");
    } catch {
      console.log("📊 AST Output:");
      console.log(astResult.output.substring(0, 200) + "...");
    }
  }
  console.log();

  // One-liner evaluation
  console.log("⚡ One-liner Evaluation:");
  const expressions = [
    "2 + 3 * 4",
    "[1, 2, 3].map(|x| x * x)",
    "let x = 42 in x * 2",
  ];

  for (const expr of expressions) {
    const result = await ruchy.eval(expr);
    console.log(`Expression: ${expr}`);
    console.log(`Result: ${result.success ? result.output : result.error}`);
    console.log();
  }

  // Integration with Deno data
  console.log("🔄 Deno ↔ Ruchy Data Integration:");
  console.log("-".repeat(30));
  
  // Pass data from Deno to Ruchy
  const denoData = { amounts: [100, 250, 500], rate: 1.09 };
  const integrationCode = `
// Process data passed from Deno
let amounts = [100, 250, 500] in
let rate = 1.09 in
let results = amounts.map(|amount| amount as f64 * rate) in
for i in 0..amounts.len() {
    println("€\${amounts[i]} = $\${results[i]}")
}
results
`;

  const integrationResult = await ruchy.runCode(integrationCode);
  console.log("💱 Currency conversion results:");
  console.log(integrationResult.success ? integrationResult.output : integrationResult.error);
  console.log();

  // Performance comparison
  console.log("🏁 Performance Comparison:");
  console.log("-".repeat(30));
  
  const fibCode = `
fun fibonacci(n: i32) -> i32 {
    if n <= 1 { n } else { fibonacci(n - 1) + fibonacci(n - 2) }
}
fibonacci(30)
`;

  const perfResult = await ruchy.runCode(fibCode);
  console.log(`🧮 Fibonacci(30) in Ruchy: ${perfResult.executionTime.toFixed(2)}ms`);
  
  // Compare with Deno implementation
  const denoStart = performance.now();
  function fibonacci(n: number): number {
    if (n <= 1) return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
  }
  const denoResult = fibonacci(30);
  const denoTime = performance.now() - denoStart;
  
  console.log(`🚀 Fibonacci(30) in Deno: ${denoTime.toFixed(2)}ms`);
  console.log(`📊 Results: Ruchy=${perfResult.output.trim()}, Deno=${denoResult}`);
  console.log();

  console.log("✨ Demo Complete! Ruchy is successfully integrated with Deno TypeScript.");
  console.log();
  console.log("💡 Use Cases for Ruchy in Deno Applications:");
  console.log("  • Advanced mathematical computations");
  console.log("  • Pattern matching and algebraic data types");
  console.log("  • Domain-specific scripting languages");
  console.log("  • Safe concurrent programming");
  console.log("  • Formal verification and property testing");
}

/**
 * Interactive ruchy shell
 */
async function interactiveShell(): Promise<void> {
  console.log("🔄 Starting Interactive Ruchy Shell");
  console.log("Type 'exit' to quit, 'help' for commands");
  console.log();

  const ruchy = new RuchyInvoker();
  
  while (true) {
    const input = prompt("ruchy> ");
    if (!input) continue;
    
    if (input.trim() === "exit") {
      break;
    }
    
    if (input.trim() === "help") {
      console.log("Commands:");
      console.log("  exit     - Exit the shell");
      console.log("  help     - Show this help");
      console.log("  check <code> - Check syntax");
      console.log("  ast <code>   - Show AST");
      console.log("  Or enter any Ruchy expression to evaluate");
      continue;
    }
    
    if (input.startsWith("check ")) {
      const code = input.substring(6);
      const result = await ruchy.check(code);
      console.log(result.success ? "✅ Syntax OK" : `❌ ${result.error}`);
      continue;
    }
    
    if (input.startsWith("ast ")) {
      const code = input.substring(4);
      const result = await ruchy.getAST(code, "pretty");
      console.log(result.output);
      continue;
    }
    
    // Evaluate expression
    const result = await ruchy.eval(input);
    if (result.success) {
      console.log(`=> ${result.output}`);
    } else {
      console.log(`❌ ${result.error || result.output}`);
    }
  }
  
  console.log("👋 Goodbye!");
}

// Main execution
if (import.meta.main) {
  const args = Deno.args;
  
  if (args.includes("--shell") || args.includes("-s")) {
    await interactiveShell();
  } else {
    await runDemo();
  }
}