import type { EnterprisePermission } from "@/lib/enterprise/types";
import type { DocumentationFeatureKey } from "@/lib/documentation-features/keys";

export interface AdminNavItem {
  href: string;
  label: string;
  permission: EnterprisePermission;
  featureFlag?: DocumentationFeatureKey;
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
        href: "/admin/documentation-agent/schemas",
        label: "Schemas",
        permission: "schemas.read",
      },
      {
        href: "/admin/documentation-agent/users",
        label: "Users",
        permission: "admin_dashboard.access",
      },
      {
        href: "/admin/documentation-agent/authentication",
        label: "Authentication",
        permission: "credentials.read_metadata",
      },
      {
        href: "/admin/documentation-agent/features",
        label: "Features",
        permission: "features.read",
      },
      {
        href: "/admin/documentation-agent/deployments",
        label: "Deployments",
        permission: "deployments.read",
        featureFlag: "admin_deployment_management",
      },
      {
        href: "/admin/documentation-agent/commits",
        label: "Commits",
        permission: "deployments.read",
        featureFlag: "admin_deployment_management",
      },
      {
        href: "/admin/documentation-agent/environments",
        label: "Environments",
        permission: "resources.read",
      },
      {
        href: "/admin/documentation-agent/change-requests",
        label: "Change Requests",
        permission: "changes.create",
      },
      {
        href: "/admin/documentation-agent/audit-logs",
        label: "Audit Logs",
        permission: "audit.read",
      },
      {
        href: "/admin/documentation-agent/settings",
        label: "Settings",
        permission: "security_settings.manage",
      },
      {
        href: "/admin/documentation-agent/apis",
        label: "APIs",
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
        permission: "domains.read",
      },
      {
        href: "/admin/documentation-agent/query-analytics",
        label: "Query analytics",
        permission: "query_analytics.read",
        featureFlag: "query_analytics",
      },
      {
        href: "/admin/documentation-agent/unanswered",
        label: "Unanswered queries",
        permission: "query_analytics.read",
        featureFlag: "unanswered_query_review",
      },
      {
        href: "/admin/documentation-agent/unanswered/weekly",
        label: "Unanswered weekly",
        permission: "query_analytics.read",
        featureFlag: "unanswered_query_weekly_analytics",
      },
      {
        href: "/admin/documentation-agent/logs",
        label: "Logs",
        permission: "audit.read",
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
        href: "/admin/security/settings",
        label: "Settings",
        permission: "security_settings.manage",
      },
    ],
  },
];

export function filterNavByCapabilities(
  capabilities: readonly EnterprisePermission[],
  enabledFeatures: ReadonlySet<string> | readonly string[] = []
): AdminNavGroup[] {
  const allowed = new Set(capabilities);
  const enabled = new Set(enabledFeatures);
  return ADMIN_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        allowed.has(item.permission) &&
        (!item.featureFlag || enabled.has(item.featureFlag))
    ),
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
