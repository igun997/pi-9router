import assert from "node:assert/strict";
import test from "node:test";
import { resolveImageCapability } from "../src/policy.ts";

test("model exact rule overrides provider image-read allow", () => {
  const allowed = resolveImageCapability(
    {
      default: false,
      providers: { gemini: true },
      models: { "gemini/gemini-2.5-pro": false },
    },
    { id: "gemini/gemini-2.5-pro", provider: "gemini" },
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

test("missing image rule denies capability", () => {
  assert.equal(
    resolveImageCapability({}, { id: "openai/gpt-5", provider: "openai" }),
    false,
  );
});
