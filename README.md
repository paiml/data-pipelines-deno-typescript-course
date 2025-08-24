# 🚀 Data Pipelines with Deno: EU to USA Conversion Course

[![Deno](https://img.shields.io/badge/Deno-2.0+-000000?logo=deno)](https://deno.land)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Coverage](https://img.shields.io/badge/Coverage-90%25+-brightgreen)](./coverage)
[![SATD](https://img.shields.io/badge/SATD-0-success)](./docs/quality-gates.md)

> Build production-grade data pipelines with Deno, TypeScript, and AI-assisted programming. Focus on real-world EU to USA data conversion scenarios with zero technical debt.

## 🎯 Course Overview

This comprehensive 4-week course teaches you to build high-performance data pipelines using Deno's modern runtime. You'll master EU to USA data conversions while learning enterprise-grade project management with PMAT and AI-first development practices.

### What You'll Build

A complete, production-ready pipeline that converts:

- 💱 **Currency**: EUR → USD with real-time rates
- 📏 **Units**: Metric → Imperial (meters → feet, Celsius → Fahrenheit)
- 📅 **Dates**: DD/MM/YYYY → MM/DD/YYYY
- 🔢 **Numbers**: 1.234,56 → 1,234.56
- 🏠 **Addresses**: EU format → USA format
- 📞 **Phone**: +44 → +1 formats
- 💰 **Tax**: VAT → Sales Tax
- 🔒 **Privacy**: GDPR → CCPA compliance

### Performance Targets

- ⚡ **Latency**: <100ms P99
- 🚄 **Throughput**: >10,000 records/second
- 📊 **Reliability**: 99.99% uptime
- 🧪 **Quality**: 90% test coverage, 0 technical debt

## 🚦 Quick Start

### Prerequisites

```bash
# Required versions
deno --version  # >=2.0.0
git --version   # >=2.40.0

# Optional but recommended
node --version  # >=20.0.0 (for tooling)
docker --version # >=24.0.0
```

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/data-pipelines-deno-typescript-course.git
cd data-pipelines-deno-typescript-course

# Initialize Deno configuration
deno task init

# Run initial tests
deno task test

# Start development
deno task dev
```

## 📚 Course Structure

### Week 1: Foundations 🏗️

- Deno runtime mastery
- TypeScript strict mode
- AI programming patterns
- Basic converters (currency, units, dates)
- **Project**: Multi-converter CLI tool

### Week 2: Core Pipeline 🔧

- Stream processing with Web Streams API
- Backpressure handling
- Error boundaries
- Pipeline composition
- **Project**: Streaming data pipeline

### Week 3: Advanced Processing ⚙️

- Complex conversions (address, tax, privacy)
- Performance optimization
- Caching strategies
- Parallel processing
- **Project**: High-performance pipeline

### Week 4: Production Systems 🚀

- Deployment strategies
- Monitoring and alerting
- CI/CD pipeline
- Performance validation
- **Final Project**: Production EU→USA pipeline

## 🛠️ Development

### Project Structure

```
src/
├── converters/           # Conversion modules
│   ├── currency/        # EUR → USD
│   ├── units/          # Metric → Imperial
│   └── formats/        # Dates, numbers, etc.
├── pipeline/           # Stream processing
│   ├── ingestion/      # Input validation
│   ├── transformation/ # Core conversions
│   └── output/        # Delivery layer
└── shared/            # Common utilities
    ├── types/         # TypeScript types
    ├── utils/         # Helper functions
    └── constants/     # Configuration
```

### Common Commands

```bash
# Development
deno task dev          # Start with watch mode
deno task test         # Run tests with coverage
deno task bench        # Run performance benchmarks

# Quality
deno task lint         # Lint code
deno task fmt          # Format code
deno task check        # Type check
deno task quality      # Run all quality checks

# Build
deno task build        # Compile for production
deno task deploy       # Deploy to Deno Deploy
```

## 📊 Quality Standards

### Zero SATD Policy

- ❌ No TODO, FIXME, HACK, or XXX comments
- ✅ Complete implementations or create tickets
- 🚨 Build fails on any SATD detection

### Complexity Limits

- Cyclomatic complexity: ≤10
- Cognitive complexity: ≤15
- Function length: ≤50 lines
- File length: ≤300 lines

### Coverage Requirements

- Week 1: 70% minimum
- Week 2: 80% minimum
- Week 3: 85% minimum
- Week 4: 90% minimum

## 🤖 AI Programming

This course emphasizes AI-assisted development:

1. **Specification-first**: Write detailed specs, AI generates implementation
2. **Test-driven with AI**: Define tests, AI creates code to pass them
3. **AI code review**: Automated reviews for style and conventions
4. **Prompt patterns**: Learn effective prompting for 10x productivity

### Recommended Tools

- [Claude Code](https://claude.ai/code) - Primary AI assistant
- [GitHub Copilot](https://copilot.github.com) - Inline suggestions
- [Cursor IDE](https://cursor.com) - AI-first editor (optional)

## 📈 Progress Tracking

### Current Sprint: Week 1 - Foundation Setup

- [ ] Configure Deno development environment
- [ ] Setup AI programming tools
- [ ] Initialize PMAT configuration
- [ ] Create project structure
- [ ] Setup quality gates
- [ ] Implement basic converters

Track detailed progress in [ROADMAP.md](./ROADMAP.md)

## 🧪 Testing

```bash
# Run all tests
deno test

# Run specific test file
deno test src/converters/currency/eur-to-usd.test.ts

# Run with coverage
deno test --coverage=coverage

# Generate coverage report
deno coverage coverage --lcov > coverage.lcov

# Run benchmarks
deno bench
```

## 🚀 Deployment

### Deno Deploy (Recommended)

```bash
# Install deployctl
deno install --allow-all --no-check -r -f https://deno.land/x/deploy/deployctl.ts

# Deploy to production
deployctl deploy --project=eu-usa-pipeline src/main.ts
```

### Alternative Platforms

- AWS Lambda with Deno Layer
- Cloudflare Workers
- Google Cloud Run
- Docker containers

## 📖 Documentation

- [Course Specification](./docs/specifications/course-repository-data-pipelines-deno.md) - Complete course details
- [Architecture Guide](./docs/architecture/README.md) - System design
- [API Reference](./docs/api/README.md) - Module documentation
- [Quality Gates](./docs/quality-gates.md) - Quality standards
- [AI Patterns](./docs/ai-patterns.md) - Effective AI usage

## 🤝 Contributing

1. Follow the [Code of Conduct](./CODE_OF_CONDUCT.md)
2. Check the [ROADMAP.md](./ROADMAP.md) for current tasks
3. Create tickets for features >3 hours
4. Maintain 90% test coverage
5. Zero SATD policy applies

## 📝 License

This course is proprietary educational content. See [LICENSE](./LICENSE) for details.

## 🙏 Acknowledgments

- Deno team for the amazing runtime
- TypeScript team for the type system
- Claude and GitHub Copilot for AI assistance
- Toyota Production System for quality principles

---

**Ready to build production-grade pipelines?** Start with [Week 1: Foundations](./docs/week1/README.md) →
