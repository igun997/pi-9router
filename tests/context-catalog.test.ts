import assert from "node:assert/strict";
import test from "node:test";
import { resolveModelContext } from "../src/context-catalog.ts";

test("settings context override wins over endpoint and catalog", () => {
  const resolved = resolveModelContext({
    id: "openai/gpt-4o",
    endpoint: { context_window: 128_000, max_tokens: 16_384 },
    overrides: { "openai/gpt-4o": { contextWindow: 8_192, maxTokens: 1_024 } },
  });

  assert.deepEqual(resolved, {
    contextWindow: 8_192,
    maxTokens: 1_024,
    source: "settings",
  });
});

test("endpoint context metadata wins over bundled catalog", () => {
  const resolved = resolveModelContext({
    id: "openai/gpt-4o",
    endpoint: { context_window: 64_000, max_tokens: 8_192 },
  });

  assert.deepEqual(resolved, {
    contextWindow: 64_000,
    maxTokens: 8_192,
    source: "endpoint",
  });
});

test("bundled catalog resolves exact verified model aliases", () => {
  const resolved = resolveModelContext({ id: "openai/gpt-4o" });

  assert.equal(resolved.contextWindow, 128_000);
  assert.equal(resolved.maxTokens, 16_384);
  assert.equal(resolved.source, "catalog");
  assert.match(resolved.reference ?? "", /openai\.com/);
});

test("unknown models use conservative fallback", () => {
  assert.deepEqual(resolveModelContext({ id: "combo/unknown" }), {
    contextWindow: 32_000,
    maxTokens: 4_096,
    source: "fallback",
  });
});
