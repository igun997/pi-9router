import assert from "node:assert/strict";
import test from "node:test";
import { resolveCapabilities, resolveModelContext } from "../src/capabilities.ts";

const full = {
  vision: true,
  pdf: false,
  audioInput: false,
  videoInput: false,
  imageOutput: false,
  audioOutput: false,
  search: true,
  tools: true,
  reasoning: true,
  thinkingFormat: "openai",
  thinkingCanDisable: true,
  thinkingRange: null,
  contextWindow: 400_000,
  maxOutput: 128_000,
};

test("router capabilities drive vision, reasoning, and limits", () => {
  const resolved = resolveCapabilities({ id: "cx/gpt-5.5", capabilities: full });

  assert.equal(resolved.vision, true);
  assert.equal(resolved.reasoning, true);
  assert.equal(resolved.tools, true);
  assert.equal(resolved.search, true);
  assert.equal(resolved.thinkingFormat, "openai");
  assert.equal(resolved.thinkingLevelMap, undefined);
  assert.equal(resolved.unreported, false);
  assert.deepEqual(resolved.context, {
    contextWindow: 400_000,
    maxTokens: 128_000,
    source: "capabilities",
  });
});

test("vision false keeps the model text-only", () => {
  assert.equal(resolveCapabilities({ id: "ag/gpt-oss-120b-medium", capabilities: { ...full, vision: false } }).vision, false);
});

test("router thinking formats unknown to pi are dropped", () => {
  assert.equal(
    resolveCapabilities({ id: "gemini/gemini-3.6-flash", capabilities: { ...full, thinkingFormat: "gemini-level" } }).thinkingFormat,
    undefined,
  );
  assert.equal(
    resolveCapabilities({ id: "alibaba/qwen3-vl-plus", capabilities: { ...full, thinkingFormat: "qwen" } }).thinkingFormat,
    "qwen",
  );
});

test("models that cannot disable thinking hide the off level", () => {
  const resolved = resolveCapabilities({
    id: "gemini/gemini-3.6-flash",
    capabilities: { ...full, thinkingCanDisable: false },
  });

  assert.deepEqual(resolved.thinkingLevelMap, { off: null });
});

test("reduced capability shape reports reasoning through thinking", () => {
  const resolved = resolveCapabilities({
    id: "kr/claude-opus-5-thinking",
    capabilities: { thinking: true, agentic: false },
  });

  assert.equal(resolved.reasoning, true);
  assert.equal(resolved.vision, false);
  assert.equal(resolved.unreported, false);
  assert.equal(resolved.context.source, "fallback");
});

test("models without any capability object are flagged unreported", () => {
  const resolved = resolveCapabilities({ id: "hemat" });

  assert.equal(resolved.unreported, true);
  assert.deepEqual(resolved.context, { contextWindow: 200_000, maxTokens: 4_096, source: "fallback" });
});

test("settings override wins over router capabilities", () => {
  assert.deepEqual(
    resolveModelContext({
      id: "cx/gpt-5.5",
      capabilities: full,
      overrides: { "cx/gpt-5.5": { contextWindow: 8_192, maxTokens: 1_024 } },
    }),
    { contextWindow: 8_192, maxTokens: 1_024, source: "settings" },
  );
});

test("legacy endpoint limits apply when capabilities omit them", () => {
  assert.deepEqual(
    resolveModelContext({
      id: "legacy/model",
      capabilities: { vision: false },
      endpoint: { context_window: 64_000, max_tokens: 8_192 },
    }),
    { contextWindow: 64_000, maxTokens: 8_192, source: "endpoint" },
  );
});
