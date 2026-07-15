# Native 9Router Provider Design

## Goal

Make 9Router a Pi-native provider: `/login 9router` stores only API credentials in Pi-managed `auth.json`; public router settings and strict image capability policy live in Pi settings. Environment variables remain compatibility fallback and `.env` is never written.

## Authentication and remote routing

Register `9router` with Pi OAuth-provider hooks so it appears in `/login` and `/logout`. This is an adapter over 9Router API-key auth, not external OAuth. Login asks for an optional 9Router URL (defaulting to `http://localhost:20128`), then accepts either a direct API key or a dashboard password used only in memory to select an API key. It validates `/v1/models`, persists the API key through Pi auth, and persists the selected non-secret URL under `pi9router.baseUrl` in settings. Remote URLs are supported; operators should use HTTPS outside localhost.

Legacy `NINEROUTER_*` and `NINE_ROUTER_*` process variables remain a lower-priority fallback. Existing `.env` and settings-env injection are removed from normal setup and never written.

## Model catalog, image policy, and context

`/v1/models` provides model IDs and `owned_by`, but no reliable token limits. Catalog discovery uses canonical model identity plus `owned_by`; it never infers context/capability/quota solely from an ID route prefix. `cx` remains a Codex route alias when `owned_by` resolves it. A bundled, source-attributed verified context catalog provides exact/versioned limits; endpoint metadata wins when supplied, settings overrides win over both, and unknown models use conservative fallback. `/9r-model <id>` reports resolved limits and source.

Image access defaults deny. Public settings define provider defaults and model exact/glob overrides separately for `read` and `generate`; model rules override provider rules. Read-approved models register `input: ["text", "image"]`, so Pi standard local `read`, paste, drag/drop, and `@image` send base64 data URLs directly to compatible models. cx accepts valid JPEG data URLs; the earlier failure was an invalid PNG E2E fixture. Other models remain text-only. No image-reader interception tool exists.

`ninerouter_generate_image` lists image models from `/v1/models/image`, validates policy before requests, calls `/v1/images/generations`, writes output locally, and returns the result to conversation. A configured default is used only when it is allowed; ambiguous selection requires the caller to name a model.

## Commands and administration

`/9r-settings` edits only the public `pi9router` section and exposes resolved policies. `/9r-quota [model]` replaces model-selection inline quota UI. It prompts dashboard password each invocation, uses session cookie only in memory, then discards it. No password is persisted. Existing provider/status/health tools remain.

## Reliability and tests

Catalog refresh failures retain last-known catalog. Login failure leaves prior credentials unchanged. Image policy denials happen before outbound calls. Context resolution exposes its source and warns on fallback.

Tests cover config precedence and validation, auth adapter login/logout behavior, catalog-to-model registration, capability gating, context precedence, image tool policy checks and responses, quota prompt behavior, and no inline quota subscription. Final E2E explicitly enables the `cx` (Codex) route alias for native image vision and image generation; it must not silently substitute another provider. README documents `/login 9router`, remote URL selection, public settings, and environment fallback.
