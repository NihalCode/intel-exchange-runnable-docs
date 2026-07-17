import type { DocumentationPermission, DocumentationRole } from "@/lib/documentation-auth/types";
import { DOCUMENTATION_ROLES } from "@/lib/documentation-auth/types";

export const documentationPermissions: Record<
  DocumentationRole,
  readonly DocumentationPermission[] | readonly ["*"]
> = {
  owner: ["*"],
  admin: [
    "manage_users",
    "manage_sources",
    "manage_integrations",
    "read_docs",
    "ask_agent",
    "sync_docs",
    "view_audit_logs",
  ],
  documentation_manager: [
    "read_docs",
    "ask_agent",
    "sync_docs",
    "manage_sources",
  ],
  developer: [
    "read_docs",
    "ask_agent",
    "view_api_details",
    "test_snippets",
    "view_technical_diagnostics",
  ],
  viewer: ["read_docs", "ask_agent"],
};

export function isDocumentationRole(value: string): value is DocumentationRole {
  return (DOCUMENTATION_ROLES as readonly string[]).includes(value);
}

export function hasPermission(
  role: DocumentationRole,
  permission: DocumentationPermission
): boolean {
  const perms = documentationPermissions[role];
  if (perms.length === 1 && perms[0] === "*") return true;
  return (perms as readonly DocumentationPermission[]).includes(permission);
}

export function permissionsForRole(role: DocumentationRole): readonly DocumentationPermission[] {
  const perms = documentationPermissions[role];
  if (perms.length === 1 && perms[0] === "*") {
    return [
      "manage_users",
      "manage_sources",
      "manage_integrations",
      "read_docs",
      "ask_agent",
      "sync_docs",
      "view_audit_logs",
      "view_api_details",
      "test_snippets",
      "view_technical_diagnostics",
    ] as const;
  }
  return perms as readonly DocumentationPermission[];
}

export function canManageUsers(role: DocumentationRole): boolean {
  return hasPermission(role, "manage_users");
}

/** Workspace roles that may open the enterprise admin dashboard. */
export function canAccessEnterpriseAdminNav(role: DocumentationRole | string): boolean {
  return role === "owner" || role === "admin" || role === "developer";
}
