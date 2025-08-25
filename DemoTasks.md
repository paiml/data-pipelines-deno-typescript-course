# Deno Task Runner Demo

This document demonstrates Deno's powerful task runner with practical examples for development workflows.

> **Note:** All task examples have been tested with Deno 2.4.5. Tasks are defined in `deno.json` and run with `deno task <name>`.

## What are Deno Tasks?

Deno tasks are a built-in way to define and run common development commands. They replace package.json scripts and provide:

- **Zero dependencies** - No need for npm scripts or Make
- **Cross-platform** - Works on Windows, macOS, and Linux
- **Fast execution** - Direct Deno runtime integration
- **Type safety** - TypeScript support in task scripts

## Task Categories

### 1. Development Tasks

Quick commands for daily development work.

```bash
# Start development server
deno task dev

# Start with file watching
deno task dev:watch

# Start API server
deno task serve

# Start with specific port
deno task serve:8080
```

**Example Output:**

```
Task dev deno run --allow-all --watch src/main.ts
Watcher Process started.
🚀 EU-USA Data Pipeline Starting...
```

### 2. Testing Tasks

Comprehensive testing workflows.

```bash
# Run all tests
deno task test

# Run tests with coverage
deno task test:coverage

# Run specific test file
deno task test:unit demo.test.ts

# Run integration tests
deno task test:integration

# Run performance tests
deno task test:perf

# Generate coverage report
deno task coverage

# Generate HTML coverage
deno task coverage:html
```

**Example Output:**

```
Task test:coverage deno test --allow-all --coverage=coverage
running 31 tests from 12 files
All tests passed! Coverage: 87.5%
```

### 3. Code Quality Tasks

Maintain code standards and quality.

```bash
# Format all code
deno task fmt

# Check formatting
deno task fmt:check

# Lint all files
deno task lint

# Type check everything
deno task check

# Run all quality checks
deno task quality

# Check for technical debt
deno task debt:check

# Fix auto-fixable issues
deno task fix
```

**Example Output:**

```
Task quality deno fmt --check && deno lint && deno check **/*.ts
✅ Format check passed
✅ Lint check passed  
✅ Type check passed
```

### 4. Build Tasks

Create production artifacts.

```bash
# Build for production
deno task build

# Build with optimizations
deno task build:prod

# Build different targets
deno task build:linux
deno task build:windows
deno task build:macos

# Build Docker image
deno task docker:build

# Create release bundle
deno task bundle
```

**Example Output:**

```
Task build deno compile --allow-all --output=dist/pipeline src/main.ts
Compile file:///src/main.ts
Bundle 4.2MB → dist/pipeline (85MB)
```

### 5. Deployment Tasks

Deploy to various environments.

```bash
# Deploy to development
deno task deploy:dev

# Deploy to staging  
deno task deploy:staging

# Deploy to production
deno task deploy:prod

# Deploy to Deno Deploy
deno task deploy:deno

# Deploy with Docker
deno task deploy:docker
```

### 6. Database Tasks

Manage database operations.

```bash
# Run database migrations
deno task db:migrate

# Reset database
deno task db:reset

# Seed test data
deno task db:seed

# Backup database
deno task db:backup

# Check database health
deno task db:health
```

### 7. Performance Tasks

Monitor and optimize performance.

```bash
# Run benchmarks
deno task bench

# Run load tests
deno task bench:load

# Memory profiling
deno task bench:memory

# Generate performance report
deno task perf:report

# Run K6 load tests
deno task k6:load

# Monitor in real-time
deno task monitor
```

### 8. Utility Tasks

Helper commands for development.

```bash
# Clean build artifacts
deno task clean

# Reset everything
deno task reset

# Generate project documentation
deno task docs

# Start local development environment
deno task env:local

# Validate configuration
deno task config:validate

# Show project information
deno task info
```

## Advanced Task Examples

### Parameterized Tasks

Pass arguments to tasks:

```bash
# Run specific converter test
deno task test:converter currency

# Deploy to custom environment
deno task deploy:custom staging-eu

# Build for specific architecture
deno task build:arch x86_64

# Run benchmark with iterations
deno task bench:iterations 1000
```

### Conditional Tasks

Tasks that behave differently based on environment:

```bash
# Different behavior in CI vs local
deno task ci

# Environment-specific setup
deno task setup:dev
deno task setup:prod

# Platform-specific tasks
deno task build:platform
```

### Composite Tasks

Tasks that run multiple commands:

```bash
# Complete quality check pipeline
deno task pipeline:quality

# Full deployment pipeline  
deno task pipeline:deploy

# Release pipeline
deno task pipeline:release

# Development setup
deno task setup:complete
```

## Task Configuration Examples

### Basic Task Structure

```json
{
  "tasks": {
    "dev": "deno run --allow-all --watch src/main.ts",
    "test": "deno test --allow-all",
    "build": "deno compile --allow-all --output=dist/app src/main.ts"
  }
}
```

### Advanced Task Configuration

```json
{
  "tasks": {
    "start": {
      "command": "deno run --allow-all src/main.ts",
      "description": "Start the application server"
    },
    "test:watch": {
      "command": "deno test --allow-all --watch",
      "dependencies": ["build"],
      "environment": {
        "NODE_ENV": "test"
      }
    },
    "quality": [
      "deno fmt --check",
      "deno lint",
      "deno check **/*.ts",
      "deno test --allow-all"
    ]
  }
}
```

## Real-World Workflow Examples

### Daily Development Workflow

```bash
# 1. Start fresh development session
deno task setup:dev

# 2. Start development server with watching
deno task dev:watch

# 3. Run tests in another terminal
deno task test:watch

# 4. Before committing changes
deno task quality

# 5. Build and test production version
deno task build && deno task test:prod
```

### CI/CD Pipeline

```bash
# 1. Install dependencies and setup
deno task ci:setup

# 2. Run comprehensive quality checks
deno task ci:quality

# 3. Run full test suite with coverage
deno task ci:test

# 4. Build production artifacts
deno task ci:build

# 5. Deploy to staging
deno task ci:deploy:staging

# 6. Run integration tests
deno task ci:test:integration

# 7. Deploy to production (if tests pass)
deno task ci:deploy:prod
```

### Performance Testing Workflow

```bash
# 1. Build optimized version
deno task build:perf

# 2. Run baseline benchmarks
deno task bench:baseline

# 3. Run load tests
deno task bench:load

# 4. Run memory profiling
deno task bench:memory

# 5. Generate performance report
deno task perf:report:generate

# 6. Compare with previous results
deno task perf:compare
```

## Task Best Practices

### 1. Naming Conventions

- Use **namespaces**: `test:unit`, `deploy:prod`
- Be **descriptive**: `build:docker` not `bd`
- Use **verbs**: `start`, `build`, `deploy`
- Group **related tasks**: `db:migrate`, `db:seed`, `db:reset`

### 2. Task Organization

```json
{
  "tasks": {
    // Development
    "dev": "...",
    "dev:watch": "...",

    // Testing
    "test": "...",
    "test:unit": "...",
    "test:integration": "...",

    // Quality
    "lint": "...",
    "fmt": "...",
    "check": "...",

    // Build
    "build": "...",
    "build:prod": "...",

    // Deploy
    "deploy:dev": "...",
    "deploy:prod": "..."
  }
}
```

### 3. Error Handling

```json
{
  "tasks": {
    "quality": "deno fmt --check && deno lint && deno test --allow-all",
    "deploy": "deno task build && deno task test && deployctl deploy",
    "ci": "set -e && deno task quality && deno task build"
  }
}
```

### 4. Cross-Platform Compatibility

```json
{
  "tasks": {
    "clean:unix": "rm -rf dist coverage",
    "clean:windows": "rmdir /s dist coverage",
    "clean": "deno run --allow-read --allow-write scripts/clean.ts"
  }
}
```

## Environment Variables in Tasks

### Setting Environment Variables

```json
{
  "tasks": {
    "dev": "DENO_ENV=development deno run --allow-all src/main.ts",
    "prod": "DENO_ENV=production deno run --allow-all src/main.ts",
    "test": "DENO_ENV=test deno test --allow-all"
  }
}
```

### Platform-Specific Environment

```bash
# Unix/Linux/macOS
deno task dev:unix

# Windows  
deno task dev:windows

# Cross-platform
deno task dev:cross
```

## Task Dependencies

### Sequential Execution

```json
{
  "tasks": {
    "build": "deno compile --allow-all src/main.ts",
    "test:build": "deno task build && deno test --allow-all",
    "deploy": "deno task test:build && deployctl deploy"
  }
}
```

### Parallel Execution

```json
{
  "tasks": {
    "test:parallel": "deno test --allow-all & deno lint & wait",
    "quality:parallel": "deno task lint & deno task fmt:check & deno task check & wait"
  }
}
```

## Debugging Tasks

### Verbose Output

```bash
# Run with verbose logging
deno task --verbose test

# Show task resolution
deno task --log-level debug build

# Dry run (show what would execute)
deno task --dry-run deploy
```

### Task Information

```bash
# List all available tasks
deno task

# Show task details
deno task --info build

# Validate task configuration
deno task --validate
```

## Integration with External Tools

### Docker Integration

```json
{
  "tasks": {
    "docker:build": "docker build -t myapp .",
    "docker:run": "docker run -p 8000:8000 myapp",
    "docker:push": "docker push myapp:latest"
  }
}
```

### Git Hooks Integration

```json
{
  "tasks": {
    "pre-commit": "deno task quality",
    "pre-push": "deno task test:full",
    "post-merge": "deno task deps:update"
  }
}
```

### External Service Integration

```json
{
  "tasks": {
    "notify:slack": "curl -X POST $SLACK_WEBHOOK -d '{\"text\":\"Deployment complete\"}'",
    "backup:s3": "aws s3 sync ./data s3://mybucket/backup",
    "metrics:push": "deno run --allow-all scripts/push-metrics.ts"
  }
}
```

## Common Task Patterns

### Health Checks

```bash
deno task health:api      # Check API endpoints
deno task health:db       # Check database connection  
deno task health:cache    # Check cache connectivity
deno task health:all      # Run all health checks
```

### Data Operations

```bash
deno task data:import     # Import data from external source
deno task data:export     # Export data to external format
deno task data:transform  # Transform data between formats
deno task data:validate   # Validate data integrity
```

### Security Tasks

```bash
deno task security:scan   # Security vulnerability scan
deno task security:audit  # Dependency audit
deno task security:check  # Security policy validation
deno task security:report # Generate security report
```

## Quick Reference

### Most Common Tasks

```bash
deno task                 # List all tasks
deno task dev            # Start development
deno task test           # Run tests  
deno task build          # Build for production
deno task quality        # Run quality checks
deno task deploy         # Deploy application
```

### Task Management

```bash
deno task --help         # Show task help
deno task --info <name>  # Show task details
deno task --list         # List all available tasks
deno task --dry-run      # Show what would run
```

### Performance Tips

- Keep tasks **simple and focused**
- Use **parallel execution** where possible
- **Cache** build artifacts
- Use **incremental** builds
- **Profile** task execution times

## Troubleshooting

### Common Issues

#### Task Not Found

```bash
# Error: Task "xyz" not found
# Solution: Check task name in deno.json
deno task  # List available tasks
```

#### Permission Denied

```bash
# Error: Permission denied
# Solution: Add appropriate --allow flags
deno task build --allow-read --allow-write
```

#### Environment Variables

```bash
# Error: Environment variable not set
# Solution: Set variable or use default
DENO_ENV=development deno task dev
```

#### Path Issues

```bash
# Error: Module not found
# Solution: Use absolute paths or check imports
deno task check  # Verify all imports
```

## Resources

- [Deno Task Runner Documentation](https://deno.land/manual/tools/task_runner)
- [Deno Configuration](https://deno.land/manual/getting_started/configuration_file)
- [Task Examples Repository](https://github.com/denoland/deno/tree/main/tests/specs/task)
- [Best Practices Guide](https://deno.land/manual/references/contributing/style_guide)
