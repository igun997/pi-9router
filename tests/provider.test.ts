import assert from "node:assert/strict";
import test from "node:test";
import { buildNineRouterProviderConfig } from "../src/provider.ts";

test("native provider config exposes login and policy-gated vision models without API key", () => {
  const config = buildNineRouterProviderConfig({
    baseUrl: "https://router.example.com",
    models: [{ id: "cx/gpt-4o", owned_by: "cx" }],
    readPolicy: { default: false, providers: { cx: true } },
    contextOverrides: {},
    login: async () => ({ access: "sk-test", refresh: "static", expires: Number.MAX_SAFE_INTEGER }),
  });

  assert.equal(config.baseUrl, "https://router.example.com/v1");
  assert.equal(config.api, "openai-completions");
  assert.equal(config.apiKey, undefined);
  assert.equal(config.models[0].input.includes("image"), true);
  assert.ok(config.oauth);
});
