# Contributing to RouterJev

Thanks for your interest in contributing to RouterJev! This document provides guidelines and information for contributors.

## How to Contribute

### Reporting Bugs

Before creating a bug report, please check existing issues to avoid duplicates. When you create a bug report, include:

- Clear descriptive title
- Steps to reproduce the issue
- Expected vs actual behavior
- Environment details (Node.js version, OS, coding agent used)
- Relevant logs (enable with `JEV_DEBUG=1`)

### Suggesting Features

Feature suggestions are welcome! Open an issue with:

- Clear description of the feature
- Use case and benefits
- Any implementation ideas you have

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add or update tests as needed
5. Ensure all tests pass (`npm test`)
6. Commit with clear messages
7. Push to your fork
8. Open a Pull Request

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/routerjev.git
cd routerjev

# Install dependencies
npm install

# Run tests
npm test

# Start proxy in debug mode
JEV_DEBUG=1 npm start
```

## Code Style

- Use ES modules (`.mjs` files)
- Follow existing code patterns
- Keep functions focused and small
- Add JSDoc comments for exported functions
- Use meaningful variable names

## Testing

All code changes should include tests. We use Node.js built-in test runner:

```bash
# Run all tests
npm test

# Run specific test file
node --test test/policy.test.mjs
```

Test coverage areas:
- Model registry (`go-models.mjs`)
- Policy decisions (`policy.mjs`)
- Proxy behavior (`go-proxy.mjs`)
- Usage tracking (`usage-tracker.mjs`)

## Project Structure

```
bin/           # CLI entry points
src/           # Core logic
  config.mjs   # Configuration and tiers
  go-models.mjs # Model registry
  go-proxy.mjs  # Proxy server
  policy.mjs    # Decision engine
  router.mjs    # Jev API client
  usage-tracker.mjs # Usage tracking
test/          # Test files
pi-extension/  # Pi coding agent extension
```

## Questions?

Open an issue or reach out via GitHub discussions.

Thank you for contributing!
