import assert from "node:assert/strict";
import test from "node:test";
import { buildNineRouterProviderConfig } from "../src/provider.ts";

test("native provider config exposes login and router-reported vision models without API key", () => {
  const config = buildNineRouterProviderConfig({
    baseUrl: "https://router.example.com",
    models: [
      {
        id: "cx/gpt-5.5",
        owned_by: "cx",
        capabilities: { vision: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: true, contextWindow: 400_000, maxOutput: 128_000 },
      },
      { id: "cx/gpt-5.3-codex-spark", owned_by: "cx", capabilities: { vision: false, contextWindow: 400_000, maxOutput: 128_000 } },
    ],
    contextOverrides: {},
    login: async () => ({ access: "sk-test", refresh: "static", expires: Number.MAX_SAFE_INTEGER }),
  });

  assert.equal(config.baseUrl, "https://router.example.com/v1");
  assert.equal(config.api, "openai-completions");
  assert.equal(config.models[0].input.includes("image"), true);
  assert.equal(config.models[0].contextWindow, 400_000);
  assert.deepEqual(config.models[0].compat, { thinkingFormat: "openai" });
  assert.deepEqual(config.models[1].input, ["text"]);
  assert.ok(config.oauth);
});
