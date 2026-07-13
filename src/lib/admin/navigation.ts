import type { EnterprisePermission } from "@/lib/enterprise/types";

export interface AdminNavItem {
  href: string;
  label: string;
  permission: EnterprisePermission;
  /** When true, only exact path match counts as active (e.g. overview routes). */
  exact?: boolean;
}

export interface AdminNavGroup {
  id: string;
  label: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      {
        href: "/admin",
        label: "Dashboard",
        permission: "admin_dashboard.access",
        exact: true,
      },
    ],
  },
  {
    id: "documentation-agent",
    label: "Documentation Agent",
    items: [
      {
        href: "/admin/documentation-agent",
        label: "Overview",
        permission: "admin_dashboard.access",
        exact: true,
      },
      {
        href: "/admin/documentation-agent/apis",
        label: "APIs",
        permission: "resources.read",
      },
      {
        href: "/admin/documentation-agent/sources",
        label: "Sources",
        permission: "resources.read",
      },
      {
        href: "/admin/documentation-agent/sync-jobs",
        label: "Sync Jobs",
        permission: "jobs.read",
      },
      {
        href: "/admin/documentation-agent/keys",
        label: "API Keys",
        permission: "credentials.read_metadata",
      },
      {
        href: "/admin/documentation-agent/domains",
        label: "Domains",
        permission: "resources.read",
      },
      {
        href: "/admin/documentation-agent/webhooks",
        label: "Webhooks",
        permission: "resources.read",
      },
      {
        href: "/admin/documentation-agent/logs",
        label: "Logs",
        permission: "audit.read",
      },
    ],
  },
  {
    id: "support-agent",
    label: "Support Agent",
    items: [
      {
        href: "/admin/support-agent",
        label: "Overview",
        permission: "admin_dashboard.access",
        exact: true,
      },
      {
        href: "/admin/support-agent/integrations",
        label: "Integrations",
        permission: "admin_dashboard.access",
      },
      {
        href: "/admin/support-agent/channels",
        label: "Channels",
        permission: "admin_dashboard.access",
      },
      {
        href: "/admin/support-agent/responses",
        label: "Responses",
        permission: "admin_dashboard.access",
      },
      {
        href: "/admin/support-agent/analytics",
        label: "Analytics",
        permission: "admin_dashboard.access",
      },
      {
        href: "/admin/support-agent/settings",
        label: "Settings",
        permission: "admin_dashboard.access",
      },
    ],
  },
  {
    id: "shared",
    label: "Shared Configuration",
    items: [
      {
        href: "/admin/environments",
        label: "Environments",
        permission: "resources.read",
      },
      {
        href: "/admin/rate-limits",
        label: "Rate Limits",
        permission: "security_settings.manage",
      },
      {
        href: "/admin/change-requests",
        label: "Change Requests",
        permission: "changes.create",
      },
      {
        href: "/admin/audit-logs",
        label: "Audit Logs",
        permission: "audit.read",
      },
    ],
  },
  {
    id: "security",
    label: "Security",
    items: [
      {
        href: "/admin/security/roles",
        label: "Roles",
        permission: "security_settings.manage",
      },
      {
        href: "/admin/security/service-accounts",
        label: "Service Accounts",
        permission: "credentials.read_metadata",
      },
      {
        href: "/admin/security/settings",
        label: "Settings",
        permission: "security_settings.manage",
      },
    ],
  },
];

export function filterNavByCapabilities(
  capabilities: readonly EnterprisePermission[]
): AdminNavGroup[] {
  const allowed = new Set(capabilities);
  return ADMIN_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => allowed.has(item.permission)),
  })).filter((group) => group.items.length > 0);
}

export function isNavItemActive(pathname: string, item: AdminNavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function breadcrumbsForPath(pathname: string): Array<{ label: string; href?: string }> {
  const crumbs: Array<{ label: string; href?: string }> = [
    { label: "Admin", href: "/admin" },
  ];
  for (const group of ADMIN_NAV_GROUPS) {
    for (const item of group.items) {
      if (isNavItemActive(pathname, item)) {
        if (item.href !== "/admin") {
          crumbs.push({ label: item.label, href: item.href });
        }
        return crumbs;
      }
    }
  }
  return crumbs;
}

export function pageTitleForPath(pathname: string): string {
  for (const group of ADMIN_NAV_GROUPS) {
    for (const item of group.items) {
      if (isNavItemActive(pathname, item)) return item.label;
    }
  }
  return "Administration";
}
