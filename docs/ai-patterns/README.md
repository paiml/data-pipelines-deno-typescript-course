# AI Programming Patterns for Data Pipelines

## Overview

This guide documents effective AI programming patterns for building data pipelines with Claude Code and GitHub Copilot. These patterns have been proven to increase development velocity by 10x while maintaining high code quality.

## Core Principles

1. **Specification-First Development**: Write detailed specs, let AI generate implementation
2. **Test-Driven with AI**: Define tests first, AI implements to pass them
3. **Iterative Refinement**: Start simple, refine with AI assistance
4. **Context Preservation**: Maintain conversation context for complex tasks

## Effective Prompting Patterns

### 1. Converter Implementation Pattern

```markdown
Create a TypeScript class that converts EUR currency to USD.

Requirements:

- Implement Converter<EUR, USD> interface
- Use Decimal.js for precision
- Cache exchange rates for 5 minutes
- Return Result<USD, ConversionError> type
- Include comprehensive error handling
- Performance target: <10ms per conversion

The class should follow functional programming principles and be fully testable.
```

### 2. Test Generation Pattern

```markdown
Generate comprehensive tests for the EuroToUsdConverter class.

Test cases should include:

- Happy path with various amounts
- Edge cases (0, negative, very large numbers)
- Decimal precision handling
- Cache behavior verification
- Error scenarios (invalid input, API failure)
- Performance benchmarks

Use Deno's built-in test framework with descriptive test names.
```

### 3. Pipeline Stage Pattern

```markdown
Implement a transformation stage for the data pipeline that:

1. Accepts AsyncIterable<EURecord>
2. Validates each record with Zod schema
3. Transforms EU format to USA format
4. Handles errors with dead letter queue
5. Implements backpressure control
6. Yields AsyncGenerator<USARecord>

Include proper TypeScript types and error handling.
```

### 4. Performance Optimization Pattern

```markdown
Optimize this function for performance:
[paste existing code]

Requirements:

- Reduce time complexity
- Minimize memory allocations
- Add caching where appropriate
- Maintain readability
- Include benchmarks showing improvement
```

## AI Tool-Specific Tips

### Claude Code

**Strengths:**

- Excellent at understanding complex requirements
- Great for architectural decisions
- Strong TypeScript/Deno knowledge
- Good at explaining implementation choices

**Best Uses:**

- Initial implementation from specs
- Complex algorithm design
- Code review and refactoring
- Documentation generation

**Example Prompt:**

```markdown
Review this pipeline implementation and suggest improvements for:

1. Error handling robustness
2. Performance optimization
3. Code maintainability
4. Test coverage gaps
   [paste code]
```

### GitHub Copilot

**Strengths:**

- Fast inline completions
- Good at repetitive patterns
- Learns from your codebase
- Quick boilerplate generation

**Best Uses:**

- Writing similar test cases
- Completing function implementations
- Import statements and types
- Repetitive code patterns

**Tips:**

- Write descriptive function names and comments first
- Start typing the pattern you want
- Use Ctrl+Enter to see multiple suggestions
- Accept partial suggestions and refine

## Common Patterns and Templates

### Error Handling Pattern

```typescript
// Prompt: Implement comprehensive error handling for converter
export class ConversionError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly details?: unknown,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = "ConversionError";
  }
}

export type Result<T, E = Error> =
  | { success: true; value: T }
  | { success: false; error: E };
```

### Stream Processing Pattern

```typescript
// Prompt: Create a stream processor with backpressure handling
export async function* processStream<T, U>(
  source: AsyncIterable<T>,
  transform: (item: T) => Promise<U>,
  options: StreamOptions = {},
): AsyncGenerator<U> {
  const { batchSize = 10, maxConcurrency = 5 } = options;
  // AI will complete the implementation
}
```

### Testing Pattern

```typescript
// Prompt: Generate property-based tests for number formatter
Deno.test("number formatter properties", async (t) => {
  await t.step("preserves numeric value", () => {
    // AI generates property test
  });

  await t.step("handles locale differences", () => {
    // AI generates locale tests
  });
});
```

## Workflow Examples

### Creating a New Converter

1. **Define the interface** (Human)

```typescript
interface DateConverter extends Converter<EUDate, USADate> {
  convert(date: EUDate): Result<USADate, ConversionError>;
}
```

2. **Generate implementation** (AI)

```markdown
Implement DateConverter that converts DD/MM/YYYY to MM/DD/YYYY format.
Handle invalid dates, leap years, and timezone considerations.
```

3. **Generate tests** (AI)

```markdown
Create comprehensive tests for DateConverter including edge cases
like 29/02 in leap years and invalid dates like 31/04.
```

4. **Optimize if needed** (AI)

```markdown
Optimize the date parsing logic for better performance.
Current: 50ms per 1000 dates. Target: <10ms.
```

### Debugging with AI

1. **Describe the issue**

```markdown
The pipeline is throwing "Maximum call stack exceeded" when processing
large batches. Here's the relevant code: [paste code]
```

2. **Get targeted fix**

```markdown
The issue is in the recursive stream processing. Convert this to an
iterative approach using async generators to prevent stack overflow.
```

## Anti-Patterns to Avoid

### ❌ Vague Requests

```markdown
"Make this code better"
```

### ✅ Specific Improvements

```markdown
"Refactor this code to reduce cyclomatic complexity below 10 and add error handling for network failures"
```

### ❌ No Context

```markdown
"Write a converter"
```

### ✅ Full Context

```markdown
"Write a converter that transforms EU phone numbers (+44) to USA format (+1), handling country codes, area codes, and extensions"
```

### ❌ Accepting Without Review

- Never accept AI code without understanding it
- Always verify edge cases
- Check for security issues
- Validate performance claims

### ✅ Critical Review Process

1. Understand the implementation
2. Verify it meets requirements
3. Check test coverage
4. Run benchmarks
5. Review for security issues

## Measuring AI Effectiveness

### Metrics to Track

1. **Development Velocity**
   - Lines of code per hour
   - Features completed per sprint
   - Time from spec to implementation

2. **Code Quality**
   - Test coverage percentage
   - Complexity metrics
   - Bug rate post-deployment

3. **Learning Curve**
   - Time to implement similar features
   - Prompt refinement iterations
   - Code review feedback

### Success Indicators

- 70% of code generated/assisted by AI
- <3 iterations to get correct implementation
- 90% test coverage maintained
- Zero SATD introduction
- 10x velocity improvement on boilerplate

## Resources

- [Claude Code Documentation](https://claude.ai/code)
- [GitHub Copilot Best Practices](https://docs.github.com/copilot)
- [Prompt Engineering Guide](https://www.promptingguide.ai)
- [Deno with AI Workflows](https://deno.land/manual/getting_started/ai_workflows)
