import assert from "node:assert/strict";
import test from "node:test";
import { toProviderModels } from "../src/catalog.ts";

test("catalog keeps owned_by and enables native image input only through read policy", () => {
  const models = toProviderModels(
    [
      { id: "google/gemini-2.5-pro", owned_by: "gemini" },
      { id: "openai/gpt-4o", owned_by: "openai" },
    ],
    {
      read: { default: false, providers: { gemini: true } },
      contextOverrides: {},
    },
  );

  assert.deepEqual(models[0].input, ["text", "image"]);
  assert.equal(models[0].ownedBy, "gemini");
  assert.deepEqual(models[1].input, ["text"]);
});
