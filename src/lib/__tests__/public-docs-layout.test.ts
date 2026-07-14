import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Auth0-gated documentation layouts", () => {
  it("requires a protected workspace on docs routes", () => {
    const layout = readFileSync(
      path.join(process.cwd(), "src/app/docs/layout.tsx"),
      "utf8"
    );
    expect(layout).toContain("requireProtectedWorkspace");
  });

  it("keeps agent, settings, and developer routes protected", () => {
    for (const relative of [
      "src/app/agent/layout.tsx",
      "src/app/settings/layout.tsx",
      "src/app/developer/layout.tsx",
    ]) {
      const layout = readFileSync(path.join(process.cwd(), relative), "utf8");
      expect(layout).toContain("requireProtectedWorkspace");
    }
  });
});
