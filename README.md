# pi-9router

Pi package for [9Router](https://github.com/decolua/9router). Registers native `9router` provider, model catalog, management tools, strict image policy, and quota commands.

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

## Image policy

All image access denies by default. Add public settings globally or per project:

```json
{
  "pi9router": {
    "baseUrl": "http://localhost:20128",
    "images": {
      "read": {
        "default": false,
        "providers": { "cx": true },
        "models": { "cx/gpt-4o": false }
      },
      "generate": {
        "default": false,
        "providers": { "cx": true },
        "defaultModel": "cx/gpt-image-1"
      }
    }
  }
}
```

Rule precedence: exact model → model glob (`"cx/gpt-image-*"`) → `owned_by` provider → default deny.

Allowed vision models register `input: ["text", "image"]`; Pi standard local `read`, paste, drag/drop, and `@image.png` send a base64 data URL directly to the selected vision model. `cx/gpt-5.5` accepts this native payload. No reader proxy tool exists.

`ninerouter_generate_image` calls `/v1/models/image` then `/v1/images/generations`. It rejects unallowed models before any generation request. For cx-only operation, enable `cx` for both `read` and `generate`; no provider fallback occurs.

## Context metadata

9Router model responses may not include token limits. Resolution order:

1. `pi9router.context.models[model-id]` override
2. Valid `context_window` and `max_tokens` from router response
3. Bundled exact, vendor-source-attributed catalog
4. Conservative `200k` context / `4k` output fallback

`/9r-model <id>` shows `owned_by`, context source, limits, reference, and image-read decision. Model identity plus discovered `owned_by` drives metadata; route prefix alone does not. `cx` maps to Codex for quota display only.

## Commands

| Command | Description |
|---|---|
| `/9r` | Router health and active provider summary |
| `/9r-quota [model-id]` | Quota check; prompts dashboard password for this invocation only |
| `/9r-settings` | Show resolved public router settings and policies |
| `/9r-model <model-id>` | Inspect context and native vision capability |
| `/9r-setup` | Migration hint to `/login 9router` |

No quota widget runs on model selection.

## Tools

| Tool | Description |
|---|---|
| `ninerouter_generate_image` | Generate image with policy-allowed model |
| `ninerouter_health` | Health check |
| `ninerouter_providers` | List provider connections |
| `ninerouter_quota` | Usage data where admin auth is available |
| `ninerouter_test` | Test provider connection |
| `ninerouter_aliases` | List model aliases |
| `ninerouter_settings` | Router settings |

## Test

Unit tests require no credentials:

```bash
npm test
```

E2E needs explicit router credentials. Final cx vision/image generation E2E uses a valid JPEG base64 data URL, enables cx in `pi9router.images.read` and `.generate`, and must fail if no cx image model is returned instead of using another provider.

## License

MIT
