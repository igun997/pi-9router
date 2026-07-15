# Native 9Router Provider Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Replace 9Router environment/setup wizard auth with Pi-native `/login`, add strict image capabilities and generation, accurate context metadata, and command-only quota.

**Architecture:** Split pure settings, policy, catalog, and context resolution into testable modules. `index.ts` becomes Pi integration: OAuth-adapter registration, dynamic catalog registration, commands, existing management tools, and image tool. Pi stores API key credentials; settings stores public remote URL and policy; no code writes `.env`.

**Tech Stack:** TypeScript ESM, Pi Extension API, `@earendil-works/pi-ai/compat`, Node `node:test`, `tsx` test runner, 9Router OpenAI-compatible APIs.

---

### Task 1: Add isolated TypeScript test runner

**Files:**
- Modify: `package.json`
- Create: `tests/helpers.ts`
- Create: `tests/settings.test.ts`

**Step 1: Write failing test**

Add `tests/settings.test.ts` using `node:test` and `node:assert/strict`, importing the not-yet-created public settings loader. Assert default local URL and image read/generate deny when no config exists.

**Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/settings.test.ts`

Expected: FAIL because `src/settings.ts` does not exist.

**Step 3: Add test script only**

Add `"test": "tsx --test tests/**/*.test.ts"` to `package.json`; add reusable temporary settings-file helper. Do not add production behavior yet.

**Step 4: Run test again**

Run: `npm test -- --test-name-pattern="default settings"`

Expected: FAIL due to missing settings module.

**Step 5: Commit**

```bash
git add package.json tests/helpers.ts tests/settings.test.ts
git commit -m "test: add 9router unit test harness"
```

### Task 2: Implement public 9Router settings and policy resolution

**Files:**
- Create: `src/settings.ts`
- Create: `src/policy.ts`
- Modify: `tests/settings.test.ts`
- Create: `tests/policy.test.ts`

**Step 1: Write failing tests**

Cover global/project merge, project override, `pi9router.baseUrl`, strict validation, default deny, provider allow, model exact deny override, and model glob allow override. Model identity uses `owned_by` plus `id`.

**Step 2: Run failing tests**

Run: `npm test -- --test-name-pattern="settings|policy"`

Expected: FAIL because settings/policy exports are absent.

**Step 3: Implement minimal modules**

Define public config:

```ts
interface NineRouterSettings {
  baseUrl?: string;
  images?: {
    read?: CapabilityRules;
    generate?: CapabilityRules & { defaultModel?: string };
  };
  context?: { models?: Record<string, { contextWindow: number; maxTokens: number }> };
}
```

Normalize URL, reject malformed values, merge global then project, and expose a resolver with precedence: model exact, model glob, provider, default false. Do not read secrets or `env` blocks.

**Step 4: Run focused tests**

Run: `npm test -- --test-name-pattern="settings|policy"`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/settings.ts src/policy.ts tests/settings.test.ts tests/policy.test.ts
git commit -m "feat: add public 9router capability settings"
```

### Task 3: Add verified context catalog and model mapping

**Files:**
- Create: `src/context-catalog.ts`
- Create: `src/catalog.ts`
- Create: `tests/context-catalog.test.ts`
- Create: `tests/catalog.test.ts`

**Step 1: Write failing tests**

Test precedence: settings override, valid endpoint `context_window`/`max_tokens`, verified exact/versioned catalog entry, then conservative fallback. Assert returned source labels. Test `/v1/models` `owned_by` is retained and image input is set only by read policy.

**Step 2: Run failing tests**

Run: `npm test -- --test-name-pattern="context|catalog"`

Expected: FAIL because catalog modules do not exist.

**Step 3: Implement minimal catalog modules**

Create source-attributed exact model specs with an update date; do not retain the existing broad name-only heuristics. Parse known 9Router fields without assuming they exist. Convert discovered entries into Pi provider model configs with policy-gated input.

**Step 4: Run focused tests**

Run: `npm test -- --test-name-pattern="context|catalog"`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/context-catalog.ts src/catalog.ts tests/context-catalog.test.ts tests/catalog.test.ts
git commit -m "feat: resolve 9router model capabilities and contexts"
```

### Task 4: Implement Pi-native login credential adapter

**Files:**
- Create: `src/login.ts`
- Create: `tests/login.test.ts`
- Modify: `index.ts`

**Step 1: Write failing tests**

Inject fetch and callback fakes. Verify direct-key login validates remote/local selected URL; dashboard-password flow fetches active keys but does not persist password; failure does not return credentials; adapter returns non-expiring Pi OAuth-shaped credentials whose API key resolves correctly.

**Step 2: Run failing tests**

Run: `npm test -- --test-name-pattern="login"`

Expected: FAIL because login adapter does not exist.

**Step 3: Implement minimal adapter**

Use Pi `oauth` provider registration so `9router` appears in `/login` and `/logout`. Prompt for optional URL with local default, then login method. Persist only API key through Pi auth; write only public selected URL to settings. Register catalog before auth when reachable and refresh/re-register after login. Retain process env API-key support as fallback. Remove `injectEnvFromSettings` and `.env` writes; make `/9r-setup` a migration notice directing users to `/login 9router`.

**Step 4: Run focused tests**

Run: `npm test -- --test-name-pattern="login"`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/login.ts index.ts tests/login.test.ts
git commit -m "feat: add native 9router login"
```

### Task 5: Add policy-controlled image generation

**Files:**
- Create: `src/images.ts`
- Create: `tests/images.test.ts`
- Modify: `index.ts`

**Step 1: Write failing tests**

Test model discovery from `/v1/models/image`, deny-before-fetch, permitted default model, ambiguous model error, explicit allowed model, URL and base64 response handling, and output path sanitation.

**Step 2: Run failing tests**

Run: `npm test -- --test-name-pattern="image"`

Expected: FAIL because image module/tool registration is absent.

**Step 3: Implement minimal image module/tool**

Register `ninerouter_generate_image` with prompt, optional model, size, quality, and count. Resolve key through Pi-supported provider auth path; if Extension API cannot expose stored provider auth to tools, use an explicitly documented Pi API/extension-supported credential accessor rather than reading `auth.json` directly. Filter all choices through policy and call `/v1/images/generations` only after validation. Write returned image data to a user-visible safe output path and return supported image/text content.

**Step 4: Run focused tests**

Run: `npm test -- --test-name-pattern="image"`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/images.ts index.ts tests/images.test.ts
git commit -m "feat: add policy-gated 9router image generation"
```

### Task 6: Replace inline quota with commands

**Files:**
- Modify: `index.ts`
- Create: `tests/quota.test.ts`

**Step 1: Write failing tests**

Test there is no `model_select` quota handler/widget, `/9r-quota` prompts for password per invocation, uses cookie only for request sequence, redacts password/cookie in error/result, and does not retain password in config.

**Step 2: Run failing tests**

Run: `npm test -- --test-name-pattern="quota"`

Expected: FAIL because current model-select handler and stored password behavior exist.

**Step 3: Implement minimal command migration**

Remove quota widget and automatic fetch. Add `/9r-quota [model]`, then use temporary dashboard login for admin endpoints only. Keep existing quota tool behavior only when an explicit temporary auth flow is available; do not cache dashboard secret.

**Step 4: Run focused tests**

Run: `npm test -- --test-name-pattern="quota"`

Expected: PASS.

**Step 5: Commit**

```bash
git add index.ts tests/quota.test.ts
git commit -m "feat: move 9router quota to command"
```

### Task 7: Add settings/model commands and migrate documentation

**Files:**
- Modify: `index.ts`
- Modify: `README.md`
- Modify: `tests/*.test.ts`

**Step 1: Write failing tests**

Cover `/9r-settings` displaying resolved public policy without secrets and `/9r-model <id>` displaying context source, capability decision, and fallback warning.

**Step 2: Run failing tests**

Run: `npm test -- --test-name-pattern="9r-settings|9r-model"`

Expected: FAIL because commands do not exist.

**Step 3: Implement minimal commands/docs**

Add public settings editor/status command and model inspection command. Rewrite README install/setup to use `/login 9router`, document optional remote URL, auth/settings split, strict image defaults, generation tool, quota command, legacy env fallback, and `.env` non-use.

**Step 4: Run full unit suite**

Run: `npm test`

Expected: PASS.

**Step 5: Commit**

```bash
git add index.ts README.md tests
git commit -m "docs: document native 9router provider setup"
```

### Task 8: Run integration verification

**Files:**
- Modify: `test.ts`
- Modify: `README.md`

**Step 1: Write failing integration cases**

Extend E2E test with authenticated model listing metadata checks and image endpoint coverage gated by explicit environment credentials. Keep default test runs secret-free and skip remote integration without credentials.

**Step 2: Run targeted test to verify test behavior**

Run: `npx tsx test.ts`

Expected: Existing integration baseline or explicit skip; do not add default credentials.

**Step 3: Implement integration coverage and final docs command list**

Remove hardcoded password fallback from `test.ts`; use explicit environment variables only. Update README verification command.

**Step 4: Run full verification**

Run:

```bash
npm test
npm run check
npx tsc --noEmit --allowImportingTsExtensions --moduleResolution bundler --module esnext --target es2022 index.ts src/*.ts tests/*.ts
```

Expected: all commands exit 0.

**Step 5: Review and commit**

```bash
git diff --check
git status --short
git add test.ts README.md
git commit -m "test: cover native 9router provider flow"
```
