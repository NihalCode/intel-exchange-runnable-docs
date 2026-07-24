import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("anonymous viewer documentation layouts", () => {
  it("does not force Auth0 workspace on docs / agent / guides / changelog", () => {
    for (const relative of [
      "src/app/docs/layout.tsx",
      "src/app/agent/layout.tsx",
      "src/app/guides/layout.tsx",
      "src/app/changelog/layout.tsx",
    ]) {
      const layout = readFileSync(path.join(process.cwd(), relative), "utf8");
      expect(layout).not.toContain("requireProtectedWorkspace");
    }
  });

  it("keeps settings, developer, and authentication routes protected", () => {
    for (const relative of [
      "src/app/settings/layout.tsx",
      "src/app/developer/layout.tsx",
      "src/app/authentication/layout.tsx",
    ]) {
      const layout = readFileSync(path.join(process.cwd(), relative), "utf8");
      expect(layout).toContain("requireProtectedWorkspace");
    }
  });
});
