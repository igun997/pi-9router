import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function withSettingsFiles(
  globalSettings: unknown,
  projectSettings: unknown,
  run: (paths: { global: string; project: string }) => void,
): void {
  const dir = mkdtempSync(join(tmpdir(), "pi-9router-test-"));
  const global = join(dir, "global.json");
  const project = join(dir, "project.json");
  try {
    writeFileSync(global, JSON.stringify(globalSettings));
    writeFileSync(project, JSON.stringify(projectSettings));
    run({ global, project });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
