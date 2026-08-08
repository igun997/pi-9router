# pi-9router

Pi package for [9Router](https://github.com/decolua/9router). Registers native `9router` provider, capability-driven model catalog, management tools, image generation policy, and quota commands.

## Install

```bash
pi install git:github.com/igun997/pi-9router
```

Or add local package path to `~/.pi/agent/settings.json`:

```json
{ "packages": ["/path/to/pi-9router"] }
```

## Login

Inside Pi:

```text
/login 9router
```

Flow:

1. Enter router URL, or leave blank for `http://localhost:20128`.
2. Enter API key directly, or enter dashboard password once to select an active API key.
3. Pi validates `/v1/models` and stores API credential in `~/.pi/agent/auth.json`.

Selected router URL is public config under `pi9router.baseUrl` in Pi settings. Dashboard password is never persisted. No `.env` is created or edited.

Remote routers work through same flow. Use HTTPS for non-local routers.

`/logout 9router` removes stored Pi credential. `/9r-setup` only shows migration instructions for `/login 9router`.

### Legacy environment compatibility

Existing shell configuration remains fallback-only:

```bash
export NINEROUTER_URL=http://localhost:20128
export NINEROUTER_KEY=sk-your-key
# legacy names also accepted: NINE_ROUTER_URL, NINE_ROUTER_API_KEY
```

New setup does not read or write project `.env` files.

## Vision (image read)

Vision comes from the router. `/v1/models` publishes a `capabilities` object per model:

```json
{
  "id": "cx/gpt-5.5",
  "owned_by": "cx",
  "capabilities": {
    "vision": true, "pdf": false, "audioInput": false, "videoInput": false,
    "imageOutput": false, "audioOutput": false, "search": true, "tools": true,
    "reasoning": true, "thinkingFormat": "openai", "thinkingCanDisable": true,
    "thinkingRange": null, "contextWindow": 400000, "maxOutput": 128000
  }
}
```

Models with `capabilities.vision === true` register `input: ["text", "image"]`. That is the single pi-wide gate for image content, so every image path works on those models with no configuration:

- built-in `read` tool on an image file
- `@screenshot.png` attachments
- terminal paste and drag/drop

Models without vision stay text-only. Pi substitutes `(image omitted: model does not support images)` instead of failing the request.

There is no image-read policy. The former `pi9router.images.read` allowlist is removed; the router is authoritative. Router metadata is sometimes conservative, and a model reported as `vision: false` is treated as text-only.

## Image generation policy

Generation spends provider credits and `/v1/models/image` publishes no capabilities, so it stays deny-by-default:

```json
{
  "pi9router": {
    "baseUrl": "http://localhost:20128",
    "images": {
      "generate": {
        "default": false,
        "providers": { "cx": true },
        "models": { "cx/gpt-5.5-image": true },
        "defaultModel": "cx/gpt-5.5-image"
      }
    }
  }
}
```

Rule precedence: exact model → model glob (`"cx/gpt-5.*-image"`) → `owned_by` provider → default deny.

`ninerouter_generate_image` calls `/v1/models/image` then `/v1/images/generations`. It rejects unallowed models before any generation request.

## Model metadata

Router capabilities map onto Pi model fields:

| 9Router capability | Pi model field |
|---|---|
| `vision` | `input: ["text", "image"]` |
| `reasoning`, or `thinking` on reduced shapes | `reasoning` |
| `contextWindow` / `maxOutput` | `contextWindow` / `maxTokens` |
| `thinkingFormat` | `compat.thinkingFormat`, only for values Pi supports (`openai`, `qwen`, `zai`, `deepseek`, ...) |
| `thinkingCanDisable: false` | `thinkingLevelMap: { "off": null }` |

Router thinking formats Pi has no value for (`gemini-level`, `claude-adaptive`, `claude-budget`, `kimi`, `minimax`) are dropped, so Pi auto-detects instead of sending an invalid field.

Context resolution order:

1. `pi9router.context.models[model-id]` override
2. `capabilities.contextWindow` and `capabilities.maxOutput`
3. legacy `context_window` and `max_tokens` response fields
4. conservative `200k` context / `4k` output fallback

Reduced router shapes land on the fallback: routes publishing only `{ thinking, agentic }`, and `combo` routes publishing no capabilities at all. Add a `pi9router.context.models` override for those.

```json
{
  "pi9router": {
    "context": {
      "models": { "hemat": { "contextWindow": 200000, "maxTokens": 64000 } }
    }
  }
}
```

`/9r-model <id>` shows `owned_by`, vision, reasoning, limits, context source, and thinking details. `cx` maps to Codex for quota display only.

## Commands

| Command | Description |
|---|---|
| `/9r` | Router health and active provider summary |
| `/9r-quota [model-id]` | Quota check; prompts dashboard password for this invocation only |
| `/9r-settings` | Resolved router settings, model and vision counts, generation policy |
| `/9r-model <model-id>` | Inspect router-reported capabilities for one model |
| `/9r-setup` | Migration hint to `/login 9router` |

No quota widget runs on model selection.
