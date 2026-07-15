import assert from "node:assert/strict";
import test from "node:test";
import { inspectRouterModel } from "../src/inspect.ts";

test("model inspection reports context source and image capability", () => {
  const text = inspectRouterModel(
    { id: "cx/gpt-4o", owned_by: "cx" },
    { contextWindow: 128_000, maxTokens: 16_384, source: "catalog" },
    true,
  );

  assert.match(text, /owned_by: cx/);
  assert.match(text, /context source: catalog/);
  assert.match(text, /image read: allowed/);
});
