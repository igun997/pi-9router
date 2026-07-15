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
