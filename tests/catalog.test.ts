import assert from "node:assert/strict";
import test from "node:test";
import { toProviderModels } from "../src/catalog.ts";

test("catalog keeps owned_by and enables image input from router vision capability", () => {
  const models = toProviderModels(
    [
      {
        id: "gemini/gemini-3.6-flash",
        owned_by: "gemini",
        capabilities: { vision: true, reasoning: true, thinkingCanDisable: false, contextWindow: 1_048_576, maxOutput: 65_536 },
      },
      {
        id: "cx/gpt-5.3-codex-spark",
        owned_by: "cx",
        capabilities: { vision: false, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: true, contextWindow: 400_000, maxOutput: 128_000 },
      },
      { id: "hemat", owned_by: "combo" },
    ],
    { contextOverrides: {} },
  );

  assert.deepEqual(models[0].input, ["text", "image"]);
  assert.equal(models[0].ownedBy, "gemini");
  assert.equal(models[0].contextWindow, 1_048_576);
  assert.equal(models[0].maxTokens, 65_536);
  assert.deepEqual(models[0].thinkingLevelMap, { off: null });
  assert.equal(models[0].compat, undefined);

  assert.deepEqual(models[1].input, ["text"]);
  assert.equal(models[1].reasoning, true);
  assert.deepEqual(models[1].compat, { thinkingFormat: "openai" });

  assert.deepEqual(models[2].input, ["text"]);
  assert.equal(models[2].reasoning, false);
  assert.equal(models[2].contextWindow, 200_000);
});

test("context overrides beat router-reported limits", () => {
  const models = toProviderModels(
    [{ id: "cx/gpt-5.5", capabilities: { vision: true, contextWindow: 400_000, maxOutput: 128_000 } }],
    { contextOverrides: { "cx/gpt-5.5": { contextWindow: 272_000, maxTokens: 64_000 } } },
  );

  assert.equal(models[0].contextWindow, 272_000);
  assert.equal(models[0].maxTokens, 64_000);
  assert.equal(models[0].capabilities.context.source, "settings");
});
