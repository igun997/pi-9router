import assert from "node:assert/strict";
import test from "node:test";
import { loadNineRouterSettings } from "../src/settings.ts";
import { withSettingsFiles } from "./helpers.ts";

test("default settings use local router and deny image capabilities", () => {
  withSettingsFiles({}, {}, ({ global, project }) => {
    const settings = loadNineRouterSettings({ globalPath: global, projectPath: project });

    assert.equal(settings.baseUrl, "http://localhost:20128");
    assert.equal(settings.images.read.default, false);
    assert.equal(settings.images.generate.default, false);
  });
});

test("project 9router settings override global public settings", () => {
  withSettingsFiles(
    {
      pi9router: {
        baseUrl: "https://global.router.example/",
        images: { read: { providers: { gemini: true } } },
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
      assert.equal(settings.images.read.providers.gemini, true);
      assert.equal(settings.images.generate.defaultModel, "openai/gpt-image-1");
    },
  );
});
