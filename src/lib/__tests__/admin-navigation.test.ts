import { describe, expect, it } from "vitest";

import {
  ADMIN_NAV_GROUPS,
  breadcrumbsForPath,
  filterNavByCapabilities,
  isNavItemActive,
  pageTitleForPath,
} from "@/lib/admin/navigation";

describe("admin navigation", () => {
  it("filters nav items by capabilities", () => {
    const filtered = filterNavByCapabilities(["admin_dashboard.access", "jobs.read"]);
    const allItems = filtered.flatMap((g) => g.items);
    expect(allItems.some((i) => i.href === "/admin")).toBe(true);
    expect(allItems.some((i) => i.href === "/admin/documentation-agent/sync-jobs")).toBe(true);
    expect(allItems.some((i) => i.href === "/admin/security/settings")).toBe(false);
  });

  it("hides feature-gated items until their feature is enabled", () => {
    const capabilities = [
      "admin_dashboard.access",
      "resources.read",
      "security_settings.manage",
    ] as const;
    const disabled = filterNavByCapabilities(capabilities);
    const enabled = filterNavByCapabilities(capabilities, [
      "support_agent",
      "placeholder_admin_modules",
    ]);

    expect(
      disabled.flatMap((group) => group.items).some((item) => item.href === "/admin/support-agent")
    ).toBe(false);
    expect(
      disabled
        .flatMap((group) => group.items)
        .some((item) => item.href === "/admin/documentation-agent/sources")
    ).toBe(false);
    expect(
      enabled.flatMap((group) => group.items).some((item) => item.href === "/admin/support-agent")
    ).toBe(true);
    expect(
      enabled
        .flatMap((group) => group.items)
        .some((item) => item.href === "/admin/documentation-agent/sources")
    ).toBe(true);
  });

  it("matches exact overview routes", () => {
    const overview = ADMIN_NAV_GROUPS[0]!.items[0]!;
    expect(isNavItemActive("/admin", overview)).toBe(true);
    expect(isNavItemActive("/admin/environments", overview)).toBe(false);
  });

  it("matches nested routes for non-exact items", () => {
    const apis = ADMIN_NAV_GROUPS[1]!.items.find((i) => i.href.endsWith("/apis"))!;
    expect(isNavItemActive("/admin/documentation-agent/apis", apis)).toBe(true);
    expect(isNavItemActive("/admin/documentation-agent/apis/extra", apis)).toBe(true);
  });

  it("builds breadcrumbs for documentation agent apis", () => {
    const crumbs = breadcrumbsForPath("/admin/documentation-agent/apis");
    expect(crumbs.map((c) => c.label)).toEqual(["Admin", "APIs"]);
  });

  it("resolves page titles from pathname", () => {
    expect(pageTitleForPath("/admin/security/settings")).toBe("Settings");
    expect(pageTitleForPath("/admin/support-agent/apis")).toBe("API Endpoints");
    expect(pageTitleForPath("/admin/support-agent/escalation")).toBe("Escalation");
  });
});
