# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-09-18

### Added

- Initial release of RouterJev
- OpenAI-compatible proxy server for OpenCode Go
- Integration with TypeSafe Jev for intelligent model routing
- 27 models organized in 4 tiers (flash, standard, power, elite)
- Usage tracking per model (5h/weekly/monthly limits)
- Automatic model rotation when limits are approached
- Policy engine with override detection, confidence thresholds, and fail-open behavior
- Stats endpoint (`/stats`) for monitoring routing decisions
- CLI tool (`jev-status`) for viewing recent decisions and usage
- Pi coding agent extension for seamless integration
- Support for 3 API formats (OpenAI-compatible, Anthropic-compatible, OpenAI Responses)
- Session tracking with `x-opencode-session` header
- 48 tests with full coverage of core components
- Comprehensive documentation (README, CONTRIBUTING)

### Technical Details

- Built with Node.js 20.12+
- Uses `@typesafe-ai/sdk` for Jev integration
- Zero external dependencies for proxy server (uses Node.js built-in `http` module)
- Fail-open design: routing failures never block requests
- Low-latency routing: ~100ms overhead per decision
- Cost-efficient: ~$0.00001 per routing decision

[0.1.0]: https://github.com/SalvaIvars/routerjev/releases/tag/v0.1.0
