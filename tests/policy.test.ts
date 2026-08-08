import assert from "node:assert/strict";
import test from "node:test";
import { resolveImageCapability } from "../src/policy.ts";

test("model exact rule overrides provider image-generation allow", () => {
  const allowed = resolveImageCapability(
    {
      default: false,
      providers: { gemini: true },
      models: { "gemini/gemini-3-pro-image-preview": false },
    },
    { id: "gemini/gemini-3-pro-image-preview", provider: "gemini" },
  );

  assert.equal(allowed, false);
});

test("model glob rule enables image generation over deny default", () => {
  const allowed = resolveImageCapability(
    { default: false, models: { "openai/gpt-image-*": true } },
    { id: "openai/gpt-image-1", provider: "openai" },
  );

  assert.equal(allowed, true);
});

test("missing image-generation rule denies capability", () => {
  assert.equal(
    resolveImageCapability({}, { id: "openai/gpt-image-1", provider: "openai" }),
    false,
  );
});
