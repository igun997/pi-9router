import assert from "node:assert/strict";
import test from "node:test";
import { resolveQuotaProvider } from "../src/quota.ts";

test("quota provider uses discovered owned_by instead of ID prefix", () => {
  assert.equal(
    resolveQuotaProvider({ id: "custom-route/gpt-4o", owned_by: "cx" }),
    "codex",
  );
});

test("quota provider remains undefined without discovered owner", () => {
  assert.equal(resolveQuotaProvider({ id: "cx/not-enough-metadata" }), undefined);
});
