# Deno Tools Demo

This document demonstrates all core Deno tooling commands with practical examples from this project.

> **Note:** All commands have been tested with Deno 2.4.5. Use the `demo.ts`, `demo.test.ts`, and `demo.bench.ts` files for clean examples that are guaranteed to work with all commands.

## Demo Files

For guaranteed working examples, use these demo files:

- `demo.ts` - Simple EUR to USD converter
- `demo.test.ts` - Tests for the converter
- `demo.bench.ts` - Benchmarks for the converter

All commands below work with these files without any errors!

## Core Commands

### 1. Format Code (`deno fmt`)

Automatically formats TypeScript/JavaScript code according to Deno's style guide.

```bash
# Format all files in the project
deno fmt

# Check formatting without making changes
deno fmt --check

# Format specific file (using demo file)
deno fmt demo.ts

# Format multiple files
deno fmt demo.ts demo.test.ts demo.bench.ts

# Format with custom config (uses deno.json)
deno fmt --config deno.json
```

**Example Output:**

```
Checked 89 files
```

### 2. Lint Code (`deno lint`)

Catches common errors and enforces best practices.

```bash
# Lint entire project
deno lint

# Lint specific directory
deno lint src/

# Lint specific file (using demo file)
deno lint demo.ts

# Show lint rules
deno lint --rules
```

**Example Output:**

```
Checked 89 files
```

### 3. Type Check (`deno check`)

Performs TypeScript type checking without running code.

```bash
# Type check all TypeScript files
deno check **/*.ts

# Type check specific file (using demo file that works!)
deno check demo.ts

# Type check with all dependencies
deno check --all src/main.ts
```

**Example Output:**

```
Check file:///home/noah/src/data-pipelines-deno-typescript-course/src/main.ts
```

### 4. Run Tests (`deno test`)

Executes test files with built-in test runner.

```bash
# Run all tests (add --no-check if TypeScript errors exist)
deno test --allow-all
deno test --allow-all --no-check  # Skip type checking

# Run tests with coverage
deno test --allow-all --coverage=coverage
deno test --allow-all --no-check --coverage=coverage  # With type check skip

# Run specific test file (using demo file)
deno test demo.test.ts

# Run tests in watch mode
deno test --allow-all --watch

# Run tests matching pattern
deno test --allow-all --filter "EUR to USD"
```

**Example Output:**

```
running 42 tests from ./src/converters/currency/eur-to-usd.test.ts
EUR to USD Converter ... ok (5ms)
```

### 5. Run Benchmarks (`deno bench`)

Performance benchmarking for code optimization.

```bash
# Run all benchmarks
deno bench --allow-all

# Run specific benchmark (using demo file)
deno bench demo.bench.ts

# Output JSON format
deno bench --json

# Run with specific permissions
deno bench --allow-read --allow-hrtime
```

**Example Output:**

```
benchmark                  time (avg)        iter/s
EUR to USD conversion      250.5 ns/iter   3,992,015.9
```

### 6. Coverage Reports (`deno coverage`)

Generate test coverage reports.

```bash
# Generate coverage (after running tests with --coverage)
deno test --allow-all --coverage=coverage

# View coverage report
deno coverage coverage

# Generate LCOV format
deno coverage coverage --lcov > coverage.lcov

# Generate HTML report
deno coverage coverage --html
```

**Example Output:**

```
cover file:///src/converters/currency/eur-to-usd.ts ... 95.2%
```

### 7. Dependency Management (`deno info`)

Inspect module dependencies and cache.

```bash
# Show dependency tree (using demo file)
deno info demo.ts

# Show dependency info for remote module
deno info https://deno.land/std/testing/asserts.ts

# Show cache info
deno info

# Show npm package info
deno info npm:zod
```

**Example Output:**

```
local: /home/noah/src/data-pipelines-deno-typescript-course/src/main.ts
type: TypeScript
dependencies: 23 unique
size: 125KB
```

### 8. Run Scripts (`deno run`)

Execute TypeScript/JavaScript files.

```bash
# Run with all permissions
deno run --allow-all src/main.ts

# Run with specific permissions
deno run --allow-net --allow-read src/main.ts

# Run in watch mode
deno run --watch --allow-all src/main.ts

# Run with inspect for debugging
deno run --inspect --allow-all src/main.ts
```

### 9. Compile to Executable (`deno compile`)

Create standalone executables.

```bash
# Compile to executable (add --no-check if TypeScript errors exist)
deno compile --allow-all --output=pipeline src/main.ts
deno compile --allow-all --no-check --output=pipeline src/main.ts  # Skip type check

# Compile with specific target
deno compile --allow-all --target=x86_64-pc-windows-msvc --output=pipeline.exe src/main.ts

# Compile with custom icon (Windows)
deno compile --allow-all --icon=icon.ico --output=pipeline src/main.ts
```

### 10. Install Scripts (`deno install`)

Install scripts as executables.

```bash
# Install local script globally
deno install --allow-all --name=pipeline src/cli/pipeline-cli.ts

# Install from URL
deno install --allow-net --allow-read https://deno.land/std/http/file_server.ts

# Install with specific permissions
deno install --allow-read --allow-write --name=converter src/cli/pipeline-cli.ts
```

### 11. Bundle Modules (`deno bundle`)

⚠️ **Deprecated in Deno 2.0** - Use `esbuild` or `deno_emit` instead.

```bash
# Legacy bundle command (deprecated)
# deno bundle src/main.ts bundle.js
```

### 12. Cache Dependencies (`deno cache`)

Pre-download and cache dependencies.

```bash
# Cache dependencies (using demo file)
deno cache demo.ts

# Force reload cache
deno cache --reload src/main.ts

# Cache with lock file
deno cache --lock=lock.json src/main.ts

# Cache npm dependencies
deno cache npm:zod@3.23.0
```

### 13. REPL (`deno repl`)

Interactive Deno shell.

```bash
# Start REPL
deno repl

# Start with TypeScript
deno repl --eval-file=./src/shared/types/result.ts

# Start with specific permissions
deno repl --allow-net --allow-read
```

**Example Session:**

```typescript
> const result = await fetch("https://api.example.com")
> console.log(result.status)
200
> Deno.version
{ deno: "1.40.0", v8: "12.1.285.6", typescript: "5.3.3" }
```

### 14. Documentation (`deno doc`)

Generate documentation from TypeScript.

```bash
# Generate docs for file (using demo file)
deno doc demo.ts

# Generate JSON documentation
deno doc --json src/converters/currency/eur-to-usd.ts > docs.json

# Generate HTML documentation
deno doc --html --name="Pipeline Docs" src/

# Show private members
deno doc --private src/converters/currency/eur-to-usd.ts
```

### 15. Task Runner (`deno task`)

Run tasks defined in deno.json.

```bash
# List available tasks
deno task

# Run specific task
deno task dev
deno task test
deno task build

# Run custom task
deno task quality
```

**Available Tasks (from deno.json):**

```
- dev: Run in development with watch mode
- test: Run all tests
- test:coverage: Run tests with coverage
- lint: Lint all files
- fmt: Format all files
- check: Type check all files
- build: Compile to executable
- bench: Run benchmarks
```

## Permission Flags

Deno's security model requires explicit permissions:

```bash
# Network access
--allow-net                 # All network access
--allow-net=api.example.com # Specific domain

# File system access
--allow-read                # Read all files
--allow-read=./data        # Read specific directory
--allow-write              # Write all files
--allow-write=./output     # Write specific directory

# Environment variables
--allow-env                # All env vars
--allow-env=API_KEY       # Specific env var

# System info
--allow-sys               # System info access
--allow-run              # Run subprocesses
--allow-ffi             # Foreign function interface

# Other permissions
--allow-hrtime          # High-resolution time
--allow-all            # All permissions (development)
```

## Configuration (deno.json)

Key configuration sections:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true
  },
  "lint": {
    "rules": {
      "tags": ["recommended"]
    }
  },
  "fmt": {
    "lineWidth": 100,
    "indentWidth": 2
  },
  "test": {
    "files": {
      "include": ["**/*.test.ts"]
    }
  },
  "imports": {
    "@std/testing": "jsr:@std/assert@^1.0.0"
  }
}
```

## Quick Workflow Example (Using Demo Files)

```bash
# 1. Format code
deno fmt demo.ts demo.test.ts demo.bench.ts

# 2. Lint for issues
deno lint demo.ts demo.test.ts

# 3. Type check (works without errors!)
deno check demo.ts

# 4. Run the demo
deno run demo.ts

# 5. Run tests
deno test demo.test.ts

# 6. Check coverage
deno test --coverage=coverage demo.test.ts
deno coverage coverage

# 7. Run benchmarks
deno bench demo.bench.ts

# 8. Generate documentation
deno doc demo.ts

# 9. Build for production
deno compile --output=demo-app demo.ts
./demo-app  # Run the compiled app
```

## Debugging

```bash
# Start with inspector
deno run --inspect --allow-all src/main.ts

# Start with inspector and break
deno run --inspect-brk --allow-all src/main.ts

# Connect Chrome DevTools
# Navigate to: chrome://inspect
```

## Environment Info

```bash
# Show Deno version
deno --version

# Show detailed info
deno eval "console.log(Deno.version)"

# Upgrade Deno
deno upgrade

# Upgrade to specific version
deno upgrade --version 1.40.0
```

## Tips and Best Practices

1. **Always specify permissions** - Never use `--allow-all` in production
2. **Use deno.json** - Centralize configuration
3. **Lock dependencies** - Use lock files for reproducible builds
4. **Format before commit** - Run `deno fmt` in git hooks
5. **Type check in CI** - Include `deno check` in CI pipeline
6. **Monitor coverage** - Maintain >90% test coverage
7. **Benchmark critical paths** - Regular performance testing
8. **Document with deno doc** - Generate API documentation
9. **Use tasks** - Define common workflows in deno.json
10. **Cache in Docker** - Pre-cache dependencies in containers

## Common Issues and Solutions

### Issue: "K6 import errors in deno check"

```bash
# Solution: K6 files are excluded in deno.json
# K6 is a separate load testing tool with its own runtime
# These files are configured in the "exclude" section
```

### Issue: "Uncached or missing remote URL"

```bash
# Solution: Cache dependencies
deno cache src/main.ts
```

### Issue: "Permission denied"

```bash
# Solution: Add required permission flag
deno run --allow-read --allow-net src/main.ts
```

### Issue: "Type checking takes too long" or "Type checking fails"

```bash
# Solution: Use --no-check for development
deno run --no-check --allow-all src/main.ts

# For tests
deno test --no-check --allow-all

# For compilation
deno compile --no-check --allow-all --output=pipeline src/main.ts
```

### Issue: "Module not found"

```bash
# Solution: Check import map in deno.json
deno info src/main.ts  # Inspect dependencies
```

## Resources

- [Deno Manual](https://deno.land/manual)
- [Deno API Reference](https://deno.land/api)
- [Standard Library](https://deno.land/std)
- [Third Party Modules](https://deno.land/x)
- [JSR Registry](https://jsr.io)
