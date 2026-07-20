import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const FRAME_FILES = [
  "src/components/AppFrame.tsx",
  "src/components/ConditionalAppFrame.tsx",
  "src/components/admin/layout/AdminFrame.tsx",
] as const;

const PROCESS_IMPORT =
  /from\s+['"](?:node:)?child_process['"]|require\(\s*['"](?:node:)?child_process['"]\s*\)/;
const PROCESS_CALL =
  /\b(?:execSync|execFileSync|spawnSync|fork)\s*\(|\b(?:exec|execFile|spawn)\s*\(/;

describe("UI frame components never invoke process execution", () => {
  for (const relative of FRAME_FILES) {
    it(`${relative} has no child_process imports or process APIs`, () => {
      const source = readFileSync(path.join(process.cwd(), relative), "utf8");
      expect(source).not.toMatch(PROCESS_IMPORT);
      expect(source).not.toMatch(PROCESS_CALL);
      expect(source).not.toMatch(/shelljs|execa|\bzx\b/);
    });
  }

  it("legacy Shell layout paths are gone", () => {
    for (const gone of [
      "src/components/AppShell.tsx",
      "src/components/ConditionalAppShell.tsx",
      "src/components/admin/shell/AdminShell.tsx",
    ]) {
      expect(() => readFileSync(path.join(process.cwd(), gone))).toThrow();
    }
  });
});
