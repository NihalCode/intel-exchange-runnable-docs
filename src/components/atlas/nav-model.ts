/**
 * Command-rail destinations for The Living Signal Atlas.
 * Permission filtering happens at render time in CommandRail.
 */

export type AtlasNavGroupId = "network" | "operate" | "command" | "system";

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
  label: string;
  href: string;
  group: AtlasNavGroupId;
  /** Stable test id for e2e */
  testId: string;
  /** When true, href is resolved with host product id */
  docsProduct?: boolean;
};

export const ATLAS_NAV_GROUPS: Array<{ id: AtlasNavGroupId; label: string }> = [
  { id: "network", label: "Network" },
  { id: "operate", label: "Operate" },
  { id: "command", label: "Command" },
  { id: "system", label: "System" },
];

export const ATLAS_NAV_ITEMS: AtlasNavItem[] = [
  {
    id: "home",
    label: "Intelligence Field",
    href: "/",
    group: "network",
    testId: "atlas-nav-home",
  },
  {
    id: "docs",
    label: "Knowledge Atlas",
    href: "/docs",
    group: "network",
    testId: "atlas-nav-docs",
    docsProduct: true,
  },
  {
    id: "ask",
    label: "Ask Intelligence",
    href: "/agent",
    group: "operate",
    testId: "nav-ask-ai",
  },
  {
    id: "build",
    label: "Build Studio",
    href: "/agent",
    group: "operate",
    testId: "atlas-nav-build",
  },
  {
    id: "developer",
    label: "API Live Console",
    href: "/developer",
    group: "operate",
    testId: "atlas-nav-developer",
  },
  {
    id: "admin",
    label: "Control Plane",
    href: "/admin",
    group: "command",
    testId: "nav-admin",
  },
  {
    id: "analytics",
    label: "Signal Telemetry",
    href: "/admin/documentation-agent/query-analytics",
    group: "command",
    testId: "atlas-nav-analytics",
  },
  {
    id: "unanswered",
    label: "Unknown Signals",
    href: "/admin/documentation-agent/unanswered",
    group: "command",
    testId: "atlas-nav-unanswered",
  },
  {
    id: "settings",
    label: "Settings",
    href: "/settings/users",
    group: "system",
    testId: "nav-settings",
  },
  {
    id: "content",
    label: "Content",
    href: "/settings/content",
    group: "system",
    testId: "nav-content",
  },
  {
    id: "credentials",
    label: "Credentials",
    href: "/authentication",
    group: "system",
    testId: "atlas-nav-credentials",
  },
  {
    id: "guides",
    label: "Guides",
    href: "/guides",
    group: "system",
    testId: "atlas-nav-guides",
  },
  {
    id: "changelog",
    label: "Changelog",
    href: "/changelog",
    group: "system",
    testId: "atlas-nav-changelog",
  },
];

export function resolveAtlasHref(item: AtlasNavItem, productId: string): string {
  if (item.docsProduct) return `/docs/${productId}`;
  return item.href;
}

export function isAtlasNavActive(pathname: string, item: AtlasNavItem, href: string): boolean {
  if (item.id === "home") return pathname === "/";
  if (item.id === "docs") return pathname.startsWith("/docs");
  if (item.id === "ask" || item.id === "build") {
    return pathname === "/agent" || pathname.startsWith("/agent/");
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
  return pathname === href || pathname.startsWith(`${href}/`);
}
