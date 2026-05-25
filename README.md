# pi-9router

Pi extension for [9Router](https://github.com/decolua/9router) — local/remote AI gateway with OpenAI-compatible REST.

Registers 9Router as a model provider + management tools for quota, providers, and health monitoring.

## Features

- **Provider** — All 9Router models available as `9router/*` in pi
- **Quota display** — Shows quota summary (🟢/🟡/🔴) when switching to 9router models
- **Tools** — Check providers, quota, test connections, view aliases/settings
- **Setup wizard** — `/9r-setup` configures URL, password, API key interactively
- **Skills** — Official 9Router skills for image gen, web search, web fetch

## Install

### From GitHub

```bash
pi install git:github.com/igun997/pi-9router
```

Add env vars to your shell rc (`~/.bashrc`, `~/.zshrc`, etc), then restart pi:

```bash
export NINEROUTER_URL=http://localhost:20128
export NINEROUTER_KEY=sk-your-key
export NINE_ROUTER_PASSWORD=your-admin-password
```

### From local clone

```bash
git clone git@github.com:igun997/pi-9router.git
cd pi-9router
```

Add package path in `~/.pi/agent/settings.json`:

```json
{
  "packages": ["/path/to/pi-9router"]
}
```

Add env vars to your shell rc (`~/.bashrc`, `~/.zshrc`, etc), then restart pi:

```bash
export NINEROUTER_URL=http://localhost:20128
export NINEROUTER_KEY=sk-your-key
export NINE_ROUTER_PASSWORD=your-admin-password
```

### Interactive setup

Inside pi:

```text
/9r-setup
```

Wizard tests URL, logs in, selects API key, and can save config.

### Quick test

```bash
NINEROUTER_URL=http://localhost:20128 \
NINE_ROUTER_PASSWORD=your-password \
NINEROUTER_KEY=sk-your-key \
pi -e /path/to/pi-9router
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NINEROUTER_URL` | No | Base URL (default: `http://localhost:20128`) |
| `NINEROUTER_KEY` | No | API key (`sk-...`) for OpenAI-compatible `/v1/*` endpoints |
| `NINE_ROUTER_PASSWORD` | No | Admin dashboard password (for quota/provider management) |

Legacy names still work: `NINE_ROUTER_URL`, `NINE_ROUTER_API_KEY`.

> **Password vs API Key:** The password authenticates to the admin dashboard (manage providers, check quota). The API key authenticates to the OpenAI-compatible endpoint (chat completions, image gen, etc). They are independent.

## Commands

| Command | Description |
|---------|-------------|
| `/9r` | Quick status: health + active providers |
| `/9r-setup` | Interactive setup wizard |

## Tools

| Tool | Description |
|------|-------------|
| `9router_health` | Health check |
| `9router_providers` | List all provider connections with status |
| `9router_quota` | Check quota/usage (single or all providers) |
| `9router_test` | Test a provider connection |
| `9router_aliases` | List model alias shortcuts |
| `9router_settings` | View router configuration |

## Skills

| Skill | Trigger |
|-------|---------|
| `9router` | Setup, model discovery, capability index |
| `9router-image` | Image generation via `/v1/images/generations` |
| `9router-web-search` | Web search via `/v1/search` |
| `9router-web-fetch` | URL → markdown via `/v1/web/fetch` |

## Quota on Model Select

When you switch to any `9router/*` model, a notification shows quota status. For prefixed models, quota is filtered to matching provider:

| Model prefix | Provider quota shown |
|--------------|---------------------|
| `cx/` | `codex` |
| `cc/` | `claude` |
| `kr/` | `kiro` |
| `ag/` | `antigravity` |
| `cu/` | `cursor` |
| `gh/` | `github` |
| `mm/` | `minimax` |

Unknown prefixes show all active providers.

```
⚡ 9Router Quota:
  🟢 claude/Account 1 [Claude Code] session (5h): 85/100, weekly (7d): 80/100
  🟢 kiro/Account 1 [KIRO PRO+] credit: 767.81/2000
  🟢 codex/Account 2 [plus] session: 87/100, weekly: 82/100
```

## Testing

```bash
NINEROUTER_URL=http://localhost:20128 \
NINE_ROUTER_PASSWORD='your-password' \
NINEROUTER_KEY='sk-your-key' \
npx tsx test.ts
```

## Project Structure

```
pi-9router/
├── package.json              # pi.extensions + pi.skills
├── index.ts                  # Extension: provider, tools, commands, events
├── test.ts                   # E2E tests
├── README.md
└── skills/
    ├── 9router/SKILL.md          # Entry point skill
    ├── 9router-image/SKILL.md    # Image generation
    ├── 9router-web-search/SKILL.md  # Web search
    └── 9router-web-fetch/SKILL.md   # Web fetch
```

## License

MIT
