# RouterJev

Local proxy that routes coding agent requests to the optimal OpenCode Go model using TypeSafe Jev.

RouterJev sits between any OpenAI-compatible coding agent and OpenCode Go's 27 models. On each user turn, it queries Jev to select the cheapest model tier that can handle the task, then forwards the request to OpenCode Go.

## Architecture

```
Coding Agent (OpenCode, Pi, Claude Code, etc.)
    |
    | OpenAI-compatible request
    | POST http://localhost:PORT/v1/chat/completions
    | model: "routerjev-auto"
    v
RouterJev Proxy
    |
    |--- Extract user prompt
    |--- Query Jev: which tier? (~100ms)
    |--- Policy: adjust for confidence, overrides, usage limits
    |--- Select model within tier (least used)
    |--- Translate format if needed
    v
OpenCode Go API (27 models, 3 API formats)
    |
    |--- /v1/chat/completions (OpenAI-compatible)
    |--- /v1/messages (Anthropic-compatible)
    |--- /v1/responses (OpenAI Responses)
    v
Response returned to agent
```

## How routing works

1. Agent sends request with `model: "routerjev-auto"`
2. Proxy extracts the user's prompt from the last message
3. Proxy calls Jev API with the prompt and asks which tier fits the task
4. Jev returns a tier choice (flash/standard/power/elite) with confidence score
5. Policy engine applies rules:
   - User override in prompt ("use power") wins over Jev
   - Low confidence (<0.3): never downgrade, cap upgrades at standard
   - Jev failure/timeout: keep current model (fail-open)
6. Select specific model within tier based on usage remaining
7. Forward request to OpenCode Go with correct format
8. Record token usage for limit tracking
9. Return response to agent

## Model tiers

Models are grouped into 4 tiers based on price and capability:

### Flash tier
Cheap models for trivial tasks, formatting, single-file fixes.

- MiMo V2.5 ($0.14/$0.28, $60/month)
- Muse Spark 1.3 Contributor ($0.10/$0.20, $60/month)
- Muse Spark 1.2 Contributor ($0.10/$0.20, $60/month)
- GLM-5.3-Flash ($0.15/$0.50, $60/month)
- DeepSeek V4 Flash ($0.15/$0.60, $30/month)
- DeepSeek V4.1 Flash ($0.15/$0.60, $60/month)
- Qwen3.8 Flash ($0.15/$0.47, $30/month)
- Hy3 ($0.14/$0.58, $60/month)

### Standard tier
Mid-price models for normal coding, multi-file edits, debugging.

- GPT 5.6 Luna ($0.20/$1.20, $15/month)
- Kimi K2.7 Code ($0.95/$4.00, $60/month)
- Kimi K2.6 ($0.95/$4.00, $60/month)
- MiniMax M3 ($0.30/$1.20, $60/month)
- MiniMax M2.7 ($0.30/$1.20, $60/month)
- MiniMax M2.5 ($0.30/$1.20, $60/month)
- Qwen3.7 Plus ($0.40/$1.60, $60/month)
- Qwen3.6 Plus ($0.50/$3.00, $60/month)
- LongCat-2.0 ($0.30/$1.20, $60/month)

### Power tier
Expensive models for complex reasoning, architecture, hard bugs.

- DeepSeek V4 Pro ($0.66/$1.98, $15/month)
- Qwen3.8 Max ($2.00/$6.00, $15/month)
- Qwen3.7 Max ($2.50/$7.50, $30/month)
- Kimi K3 ($3.00/$15.00, $15/month)
- MiMo V2.5 Pro ($0.435/$0.87, $15/month)
- Hy4 preview ($0.834/$2.501, $30/month)
- GLM-5.3 ($1.40/$4.40, $15/month)
- GLM-5.2 ($1.40/$4.40, $60/month)
- GLM-5.1 ($1.40/$4.40, $60/month)

### Elite tier
Very expensive or specialized models for system design, critical code, vision tasks.

- Grok 4.6 ($2.00/$6.00, $15/month)
- DeepSeek V4 Flash Vision Exp ($0.15/$0.60, $15/month, vision-specialized)

## Usage limits

Each model has independent usage limits:

- 5-hour limit: 20% of monthly limit
- Weekly limit: 50% of monthly limit
- Monthly limit: 100% (varies by model, $15-$60)

For example, Kimi K2.7 Code has:
- 5-hour limit: $12 (20% of $60)
- Weekly limit: $30 (50% of $60)
- Monthly limit: $60

RouterJev tracks consumption per model and:
- Avoids models near their limits
- Rotates between models in the same tier to distribute load
- Falls back to least-used model if all in tier are exhausted
- Never blocks a request (always finds an available model)

## API formats

OpenCode Go uses 3 different API formats. RouterJev handles translation automatically:

- **OpenAI-compatible** (`/v1/chat/completions`): GLM, Kimi, DeepSeek, MiMo, Hy, LongCat
- **Anthropic-compatible** (`/v1/messages`): MiniMax, Qwen
- **OpenAI Responses** (`/v1/responses`): Grok, GPT, Muse Spark

Your agent always uses OpenAI-compatible format. The proxy translates as needed.

## Requirements

- Node.js >= 20.12
- OpenCode Go subscription ($10/month): https://opencode.ai/auth
- TypeSafe Jev API key: https://typesafe.ai

## Installation

```bash
git clone https://github.com/SalvaIvars/routerjev.git
cd routerjev
npm install
```

## Configuration

Create `~/.jev-router.env`:

```bash
OPENCODE_GO_API_KEY=your-opencode-go-key
JEV_API_KEY=your-typesafe-jev-key
```

## Usage

Start the proxy:

```bash
npm start
```

The proxy starts on a random port and displays the URL.

### OpenCode configuration

```json
{
  "providers": {
    "routerjev": {
      "type": "openai-compatible",
      "base_url": "http://127.0.0.1:PORT",
      "api_key": "your-opencode-go-key"
    }
  },
  "models": {
    "default": {
      "provider": "routerjev",
      "model": "routerjev-auto"
    }
  }
}
```

### Pi configuration

RouterJev includes a Pi extension in `pi-extension/`.

Install:

```bash
pi extension install ./pi-extension
```

Use:

```bash
pi --model routerjev/routerjev-auto
```

### Claude Code / Codex / other agents

Configure as OpenAI-compatible provider:

```json
{
  "base_url": "http://127.0.0.1:PORT/v1",
  "api_key": "your-opencode-go-key",
  "model": "routerjev-auto"
}
```

## Session tracking

OpenCode Go requires the `x-opencode-session` header for routing optimization and prompt caching. RouterJev sends this header automatically with a stable session ID.

## Monitoring routing decisions

View recent decisions and usage:

```bash
node bin/jev-status.mjs
```

Or query the stats endpoint:

```bash
curl http://127.0.0.1:PORT/stats
```

Returns JSON with:
- Recent decisions (tier, model, confidence, latency, prompt)
- Usage per model (5h/weekly/monthly windows)

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| OPENCODE_GO_API_KEY | Yes | OpenCode Go API key |
| JEV_API_KEY | No | TypeSafe Jev API key (enables routing) |
| TYPESAFE_API_KEY | No | Alternative name for Jev key |
| JEV_DEBUG | No | Enable debug logging to ~/.jev-claude.log |
| JEV_DUMP | No | Path to dump request bodies for debugging |

## Testing

```bash
npm test
```

## Project structure

```
bin/jev-opencode.mjs      Proxy launcher
bin/jev-status.mjs        CLI for viewing routing decisions
src/config.mjs            Tiers, thresholds, Jev questions
src/go-models.mjs         Model registry (27 models, 4 tiers)
src/go-proxy.mjs          OpenAI-compatible proxy server
src/policy.mjs            Decision engine (override, confidence, fallback)
src/router.mjs            TypeSafe Jev API client
src/usage-tracker.mjs     Per-model usage tracking
src/log.mjs               Logging utilities
pi-extension/             Pi coding agent extension
test/                     Test suite (48 tests)
```

## License

MIT
