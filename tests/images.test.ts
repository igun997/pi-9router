import assert from "node:assert/strict";
import test from "node:test";
import { generateImage, selectImageModel } from "../src/images.ts";

const models = [
  { id: "cx/gpt-image-1", owned_by: "cx" },
  { id: "openai/gpt-image-1", owned_by: "openai" },
];

test("selects allowed configured image default", () => {
  assert.equal(
    selectImageModel(models, { default: false, providers: { cx: true }, defaultModel: "cx/gpt-image-1" }),
    "cx/gpt-image-1",
  );
});

test("denied image model fails before request", async () => {
  let requested = false;
  await assert.rejects(
    generateImage({
      baseUrl: "http://router.test",
      apiKey: "sk-test",
      models,
      rules: { default: false },
      prompt: "make image",
      fetch: async () => {
        requested = true;
        return new Response();
      },
    }),
    /allowed/,
  );
  assert.equal(requested, false);
});

test("requires explicit model when multiple allowed models have no default", () => {
  assert.throws(
    () => selectImageModel(models, { default: true }),
    /Specify model/,
  );
});

test("calls 9Router image endpoint with selected cx model", async () => {
  let request: { url: string; body?: string } | undefined;
  const result = await generateImage({
    baseUrl: "http://router.test",
    apiKey: "sk-test",
    models,
    rules: { default: false, providers: { cx: true } },
    model: "cx/gpt-image-1",
    prompt: "cyan mountain",
    fetch: async (url, init) => {
      request = { url: String(url), body: init?.body as string | undefined };
      return new Response(JSON.stringify({ data: [{ url: "https://image.test/file.png" }] }));
    },
  });

  assert.equal(request?.url, "http://router.test/v1/images/generations");
  assert.deepEqual(JSON.parse(request?.body ?? "{}"), { model: "cx/gpt-image-1", prompt: "cyan mountain" });
  assert.deepEqual(result, { model: "cx/gpt-image-1", urls: ["https://image.test/file.png"], base64: [] });
});
