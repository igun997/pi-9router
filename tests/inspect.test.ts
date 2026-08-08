import assert from "node:assert/strict";
import test from "node:test";
import { resolveCapabilities } from "../src/capabilities.ts";
import { inspectRouterModel } from "../src/inspect.ts";

test("model inspection reports router vision capability and context source", () => {
  const text = inspectRouterModel(
    { id: "cx/gpt-5.5", owned_by: "cx" },
    resolveCapabilities({
      id: "cx/gpt-5.5",
      capabilities: { vision: true, reasoning: true, tools: true, thinkingFormat: "openai", contextWindow: 400_000, maxOutput: 128_000 },
    }),
  );

  assert.match(text, /owned_by: cx/);
  assert.match(text, /vision \(image read\): yes/);
  assert.match(text, /context source: capabilities/);
  assert.match(text, /thinking format: openai/);
});

test("model inspection flags models the router does not describe", () => {
  const text = inspectRouterModel({ id: "hemat", owned_by: "combo" }, resolveCapabilities({ id: "hemat" }));

  assert.match(text, /vision \(image read\): no/);
  assert.match(text, /context source: fallback/);
  assert.match(text, /no capabilities/);
});
