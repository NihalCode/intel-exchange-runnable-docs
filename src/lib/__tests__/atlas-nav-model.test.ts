import { describe, expect, it } from "vitest";
import {
  ATLAS_NAV_GROUPS,
  ATLAS_NAV_ITEMS,
  atlasBreadcrumbs,
  isAtlasNavActive,
  resolveAtlasHref,
} from "@/components/atlas/nav-model";

describe("atlas nav model", () => {
  it("uses plain-language groups Home/Learn/Work/Manage/Account", () => {
    expect(ATLAS_NAV_GROUPS.map((g) => g.label)).toEqual([
      "Home",
      "Learn",
      "Work",
      "Manage",
      "Account",
    ]);
  });

  it("leads with conventional labels", () => {
    const byId = Object.fromEntries(ATLAS_NAV_ITEMS.map((i) => [i.id, i]));
    expect(byId.ask?.label).toBe("Ask AI");
    expect(byId.unanswered?.label).toBe("Unanswered Queries");
    expect(byId.analytics?.label).toBe("Analytics");
    expect(byId.developer?.label).toBe("API Explorer");
    expect(byId.build?.label).toBe("Build App");
    expect(byId.docs?.label).toBe("Documentation");
  });

  it("resolves docs href with product id", () => {
    const docs = ATLAS_NAV_ITEMS.find((i) => i.id === "docs")!;
    expect(resolveAtlasHref(docs, "csap")).toBe("/docs/csap");
  });

  it("marks Ask AI vs Build App active from focus query", () => {
    const ask = ATLAS_NAV_ITEMS.find((i) => i.id === "ask")!;
    const build = ATLAS_NAV_ITEMS.find((i) => i.id === "build")!;
    expect(isAtlasNavActive("/agent", ask, "/agent")).toBe(true);
    expect(isAtlasNavActive("/agent", build, "/agent?focus=build")).toBe(false);
    expect(isAtlasNavActive("/agent", ask, "/agent", "focus=build")).toBe(false);
    expect(isAtlasNavActive("/agent", build, "/agent?focus=build", "focus=build")).toBe(
      true
    );
  });

  it("builds plain-language breadcrumbs", () => {
    expect(atlasBreadcrumbs("/", "CTIX")).toEqual(["Home", "Overview"]);
    expect(atlasBreadcrumbs("/agent", "CTIX")).toEqual(["Work", "Ask AI"]);
    expect(atlasBreadcrumbs("/admin/documentation-agent/unanswered", "CTIX")).toEqual([
      "Manage",
      "Unanswered Queries",
    ]);
  });
});
