# RouterJev

Local proxy that routes coding agent requests to the optimal OpenCode Go model using TypeSafe Jev.

RouterJev sits between any OpenAI-compatible coding agent and OpenCode Go's 28+ models. On each user turn, it queries Jev to select the cheapest model tier that can handle the task, then forwards the request to OpenCode Go.

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
OpenCode Go API (28+ models)
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

| Tier | Models | Use case |
|------|--------|----------|
| flash | MiMo V2.5, Muse Spark, GLM-5.3-Flash, DeepSeek V4 Flash, Qwen3.8 Flash, Hy3 | Trivial edits, formatting, single-file fixes |
| standard | Kimi K2.7 Code, Kimi K2.6, MiniMax M3/M2.7, Qwen3.7/3.6 Plus, LongCat-2.0 | Normal coding, multi-file edits, debugging |
| power | DeepSeek V4 Pro, Qwen3.8/3.7 Max, Kimi K3, MiMo V2.5 Pro, Hy4, GLM-5.3 | Complex reasoning, architecture, hard bugs |
| elite | Grok 4.6, GPT 5.6 Luna, DeepSeek V4.1 Flash, V4 Flash Vision | System design, critical code, migrations |

## Usage limits

Each OpenCode Go model has independent usage limits:

- 5-hour limit: 20% of monthly limit
- Weekly limit: 50% of monthly limit
- Monthly limit: 100% (varies by model, $15-$60)

RouterJev tracks consumption per model and:
- Avoids models near their limits
- Rotates between models in the same tier
- Falls back to least-used model if all in tier are exhausted

## Requirements

- Node.js >= 20.12
- OpenCode Go subscription ($10/month): https://opencode.ai/auth
- TypeSafe Jev API key (early access): https://typesafe.ai

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

Configure your coding agent:

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

## Pi integration

RouterJev includes a Pi extension in `pi-extension/`.

Install:

```bash
pi extension install ./pi-extension
```

Use:

```bash
pi --model routerjev/routerjev-auto
```

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
src/go-models.mjs         Model registry (28 models, 4 tiers)
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
