# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a comprehensive Deno/TypeScript course focused on building production-grade data pipelines for EU to USA data conversion. The course emphasizes AI-assisted programming, zero technical debt, and enterprise project management practices using PMAT (Project Management and Tracking).

## Core Development Commands

### Deno Project Setup and Initialization

```bash
# Initialize Deno configuration (if not present)
deno init

# Create required project structure
mkdir -p src/{converters,pipeline,shared}/{currency,units,formats}
mkdir -p src/pipeline/{ingestion,transformation,output}
mkdir -p src/shared/{types,utils,constants}
mkdir -p tests/{unit,integration,e2e}
mkdir -p docs/{architecture,api,guides}
```

### Development Commands

```bash
# Format code
deno fmt

# Lint code
deno lint

# Type check
deno check **/*.ts

# Run tests with coverage
deno test --coverage=coverage

# Generate coverage report
deno coverage coverage --lcov > coverage.lcov

# Run benchmarks
deno bench

# Run specific test file
deno test src/converters/currency/eur-to-usd.test.ts

# Watch mode for development
deno test --watch
```

### Quality Gate Enforcement

```bash
# Check for SATD comments (TODO, FIXME, HACK, XXX) - MUST be zero
grep -r "TODO\|FIXME\|HACK\|XXX" --include="*.ts" . || echo "✓ No SATD"

# Check test coverage (must be ≥90% for final project)
deno coverage coverage | grep "All files"

# Run full quality check
deno fmt --check && deno lint && deno test --coverage=coverage
```

### PMAT Integration

```bash
# Create pmat.toml configuration
cat > pmat.toml << 'EOF'
[quality_gate]
max_cyclomatic_complexity = 10
max_cognitive_complexity = 15
max_satd_comments = 0
min_test_coverage = 90.0
EOF

# Run PMAT validation (when available)
pmat validate
pmat quality-check
```

## Architecture Overview

### Conversion Pipeline Architecture

The system implements a three-stage pipeline for EU→USA data conversion:

1. **Ingestion Stage** (`src/pipeline/ingestion/`)
   - Validates incoming EU data using Zod schemas
   - Handles multiple input sources (HTTP, WebSocket, Files)
   - Implements backpressure and error boundaries

2. **Transformation Stage** (`src/pipeline/transformation/`)
   - Core conversion logic for all EU→USA transformations
   - Supports: currency, units, dates, numbers, addresses, tax, privacy
   - Uses functional composition with error handling via Result types

3. **Output Stage** (`src/pipeline/output/`)
   - Formats converted data for target systems
   - Supports multiple sinks (Database, API, Files, Queues)
   - Implements delivery confirmation and retry logic

### Key Conversion Types

Focus area is EU to USA conversions:

- **Currency**: EUR → USD with real-time exchange rates
- **Units**: Metric (m, km, °C) → Imperial (ft, mi, °F)
- **Dates**: DD/MM/YYYY → MM/DD/YYYY
- **Numbers**: 1.234,56 → 1,234.56
- **Tax**: VAT (20%) → Sales Tax (varies by state)
- **Privacy**: GDPR fields → CCPA compliance mapping

### Stream Processing Pattern

All converters use async generators for memory-efficient streaming:

```typescript
async *process(source: AsyncIterable<EURecord>): AsyncGenerator<USARecord>
```

### Error Handling Strategy

- Use Result<T, E> pattern for all conversions
- Implement circuit breakers for external API calls
- Dead letter queue for failed conversions
- Structured error types with error codes

## Quality Standards

### Mandatory Requirements

- **Zero SATD Policy**: No TODO, FIXME, HACK, or XXX comments
- **Complexity Limits**: Cyclomatic ≤10, Cognitive ≤15
- **Test Coverage**: Week 1: 70% → Week 4: 90%
- **Performance**: P99 latency <100ms, throughput >1000 records/sec

### File Naming Conventions

- Files: `kebab-case.ts`
- Test files: `{name}.test.ts` (colocated with source)
- Classes/Interfaces: `PascalCase`
- Functions/Variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE`

## Course-Specific Context

### Week-by-Week Focus

- **Week 1**: Basic converters, Deno setup, AI programming patterns
- **Week 2**: Stream pipeline, backpressure, error handling
- **Week 3**: Complex conversions (address, tax, privacy), performance
- **Week 4**: Production deployment, monitoring, final project

### AI Programming Integration

- Use Claude/Copilot for initial implementations
- AI generates tests from specifications
- Human reviews focus on business logic and architecture
- Document AI prompts that work well in `docs/ai-patterns.md`

### Project Management

- Track all work in `ROADMAP.md` with checkboxes
- Create tickets for features >3 hours of work
- Update quality gates weekly in `docs/quality-gates.md`
- Commit frequently (<50 lines per commit)

## Common Implementation Patterns

### Converter Pattern

```typescript
export class {Type}Converter implements Converter<EUType, USAType> {
  async convert(input: EUType, config?: Config): Promise<Result<USAType, ConversionError>>
}
```

### Pipeline Stage Pattern

```typescript
export class {Stage}Stage implements PipelineStage<Input, Output> {
  async *process(source: AsyncIterable<Input>): AsyncGenerator<Output>
}
```

### Testing Pattern

Each converter requires:

- Unit tests with edge cases
- Integration tests with real data
- Performance benchmarks
- Property-based tests for invariants

## Deployment Targets

Primary: **Deno Deploy** (built-in support)
Secondary: AWS Lambda, Cloudflare Workers
All deployments must maintain <100ms P99 latency
