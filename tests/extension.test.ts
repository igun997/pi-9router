import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("extension does not redeclare imported context resolver", async () => {
  const source = await readFile(new URL("../index.ts", import.meta.url), "utf8");

  assert.doesNotMatch(source, /\bfunction\s+resolveModelContext\b/);
});
