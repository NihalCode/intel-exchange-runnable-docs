/**
 * Command-rail destinations for The Living Signal Atlas.
 * Primary labels are plain language; atmospheric names are secondary.
 * Permission filtering happens at render time in CommandRail.
 */

export type AtlasNavGroupId = "home" | "learn" | "work" | "manage" | "account";

export type AtlasNavItemId =
  | "home"
  | "docs"
  | "ask"
  | "build"
  | "developer"
  | "admin"
  | "analytics"
  | "unanswered"
  | "settings"
  | "content"
  | "credentials"
  | "guides"
  | "changelog";

export type AtlasNavItem = {
  id: AtlasNavItemId;
  /** Conventional product label — always shown as primary */
  label: string;
  /** Atmospheric Atlas name — secondary, optional */
  atmosphere?: string;
  href: string;
  group: AtlasNavGroupId;
  /** Stable test id for e2e */
  testId: string;
  /** When true, href is resolved with host product id */
  docsProduct?: boolean;
};

export const ATLAS_NAV_GROUPS: Array<{ id: AtlasNavGroupId; label: string }> = [
  { id: "home", label: "Home" },
  { id: "learn", label: "Learn" },
  { id: "work", label: "Work" },
  { id: "manage", label: "Manage" },
  { id: "account", label: "Account" },
];

export const ATLAS_NAV_ITEMS: AtlasNavItem[] = [
  {
    id: "home",
    label: "Overview",
    atmosphere: "Intelligence Field",
    href: "/",
    group: "home",
    testId: "atlas-nav-home",
  },
  {
    id: "docs",
    label: "Documentation",
    atmosphere: "Knowledge Atlas",
    href: "/docs",
    group: "learn",
    testId: "atlas-nav-docs",
    docsProduct: true,
  },
  {
    id: "guides",
    label: "Guides",
    href: "/guides",
    group: "learn",
    testId: "atlas-nav-guides",
  },
  {
    id: "changelog",
    label: "Changelog",
    href: "/changelog",
    group: "learn",
    testId: "atlas-nav-changelog",
  },
  {
    id: "ask",
    label: "Ask AI",
    atmosphere: "Ask Intelligence",
    href: "/agent",
    group: "work",
    testId: "nav-ask-ai",
  },
  {
    id: "build",
    label: "Build App",
    atmosphere: "Build Studio",
    href: "/agent?focus=build",
    group: "work",
    testId: "atlas-nav-build",
  },
  {
    id: "developer",
    label: "API Explorer",
    atmosphere: "Live Console",
    href: "/developer",
    group: "work",
    testId: "atlas-nav-developer",
  },
  {
    id: "analytics",
    label: "Analytics",
    atmosphere: "Signal Telemetry",
    href: "/admin/documentation-agent/query-analytics",
    group: "manage",
    testId: "atlas-nav-analytics",
  },
  {
    id: "unanswered",
    label: "Unanswered Queries",
    atmosphere: "Unknown Signals",
    href: "/admin/documentation-agent/unanswered",
    group: "manage",
    testId: "atlas-nav-unanswered",
  },
  {
    id: "admin",
    label: "Admin",
    atmosphere: "Control Plane",
    href: "/admin",
    group: "manage",
    testId: "nav-admin",
  },
  {
    id: "settings",
    label: "Settings",
    href: "/settings/users",
    group: "account",
    testId: "nav-settings",
  },
  {
    id: "content",
    label: "Content",
    href: "/settings/content",
    group: "account",
    testId: "nav-content",
  },
  {
    id: "credentials",
    label: "Credentials",
    href: "/authentication",
    group: "account",
    testId: "atlas-nav-credentials",
  },
];

export function resolveAtlasHref(item: AtlasNavItem, productId: string): string {
  if (item.docsProduct) return `/docs/${productId}`;
  return item.href;
}

export function isAtlasNavActive(
  pathname: string,
  item: AtlasNavItem,
  href: string,
  search = "",
): boolean {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const focusBuild = params.get("focus") === "build";

  if (item.id === "home") return pathname === "/";
  if (item.id === "docs") return pathname.startsWith("/docs");
  if (item.id === "ask") {
    // Prefer Ask AI as the active /agent item unless Build App deep-link is present.
    return (pathname === "/agent" || pathname.startsWith("/agent/")) && !focusBuild;
  }
  if (item.id === "build") {
    return (pathname === "/agent" || pathname.startsWith("/agent/")) && focusBuild;
  }
  if (item.id === "admin") {
    return (
      pathname === "/admin" ||
      (pathname.startsWith("/admin/") &&
        !pathname.includes("/query-analytics") &&
        !pathname.includes("/unanswered"))
    );
  }
  if (item.id === "analytics") return pathname.includes("/query-analytics");
  if (item.id === "unanswered") return pathname.includes("/unanswered");
  const pathOnly = href.split("?")[0] ?? href;
  return pathname === pathOnly || pathname.startsWith(`${pathOnly}/`);
}

/** Plain-language breadcrumb crumbs for the command bar. */
export function atlasBreadcrumbs(pathname: string, productLabel: string): string[] {
  if (pathname === "/") return ["Home", "Overview"];
  if (pathname.startsWith("/docs")) return ["Learn", "Documentation", productLabel];
  if (pathname.startsWith("/guides")) return ["Learn", "Guides"];
  if (pathname.startsWith("/changelog")) return ["Learn", "Changelog"];
  if (pathname.startsWith("/agent")) return ["Work", "Ask AI"];
  if (pathname.startsWith("/developer")) return ["Work", "API Explorer"];
  if (pathname.includes("/query-analytics")) return ["Manage", "Analytics"];
  if (pathname.includes("/unanswered")) return ["Manage", "Unanswered Queries"];
  if (pathname.startsWith("/admin")) return ["Manage", "Admin"];
  if (pathname.startsWith("/authentication")) return ["Account", "Credentials"];
  if (pathname.startsWith("/settings/content")) return ["Account", "Content"];
  if (pathname.startsWith("/settings")) return ["Account", "Settings"];
  return ["Atlas"];
}
