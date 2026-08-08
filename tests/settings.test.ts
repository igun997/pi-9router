import assert from "node:assert/strict";
import test from "node:test";
import { loadNineRouterSettings, saveNineRouterBaseUrl } from "../src/settings.ts";
import { withSettingsFiles } from "./helpers.ts";

test("default settings use local router and deny image generation", () => {
  withSettingsFiles({}, {}, ({ global, project }) => {
    const settings = loadNineRouterSettings({ globalPath: global, projectPath: project });

    assert.equal(settings.baseUrl, "http://localhost:20128");
    assert.equal(settings.images.generate.default, false);
    assert.equal("read" in settings.images, false);
  });
});

test("saves selected router URL without writing secrets", () => {
  withSettingsFiles({}, {}, ({ global, project }) => {
    saveNineRouterBaseUrl(global, "https://router.example.com/");

    assert.equal(loadNineRouterSettings({ globalPath: global, projectPath: project }).baseUrl, "https://router.example.com");
  });
});

test("project 9router settings override global public settings", () => {
  withSettingsFiles(
    {
      pi9router: {
        baseUrl: "https://global.router.example/",
        images: { generate: { providers: { gemini: true } } },
        context: { models: { "cx/gpt-5.5": { contextWindow: 272_000, maxTokens: 64_000 } } },
      },
    },
    {
      pi9router: {
        baseUrl: "https://project.router.example/v1/",
        images: { generate: { defaultModel: "openai/gpt-image-1" } },
      },
    },
    ({ global, project }) => {
      const settings = loadNineRouterSettings({ globalPath: global, projectPath: project });

      assert.equal(settings.baseUrl, "https://project.router.example/v1");
      assert.equal(settings.images.generate.providers.gemini, true);
      assert.equal(settings.images.generate.defaultModel, "openai/gpt-image-1");
      assert.deepEqual(settings.context.models["cx/gpt-5.5"], { contextWindow: 272_000, maxTokens: 64_000 });
    },
  );
});
