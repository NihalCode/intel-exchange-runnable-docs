import {
  ENTERPRISE_PERMISSIONS,
  type AuthorizationResource,
  type EnterprisePermission,
  type EnterprisePrincipal,
  type EnterpriseRole,
} from "@/lib/enterprise/types";

const ROLE_PERMISSIONS: Record<EnterpriseRole, readonly EnterprisePermission[]> = {
  owner: ENTERPRISE_PERMISSIONS,
  admin: ENTERPRISE_PERMISSIONS,
  developer: [
    "admin_dashboard.access",
    "resources.read",
    "resources.write",
    "changes.create",
    "changes.submit",
    "credentials.read_metadata",
    "features.read",
    "schemas.read",
    "schemas.manage",
    "audit.read",
    "jobs.read",
    "domains.read",
    "deployments.read",
    "collections.read",
    "query_analytics.read",
    "unanswered_queries.read",
  ],
};

const ENTERPRISE_ROLES = new Set<EnterpriseRole>(["owner", "admin", "developer"]);

export function mapEnterpriseRole(role: string): EnterpriseRole | null {
  return ENTERPRISE_ROLES.has(role as EnterpriseRole)
    ? (role as EnterpriseRole)
    : null;
}

export function canBootstrapEnterpriseOrganization(role: string): boolean {
  const mapped = mapEnterpriseRole(role);
  return mapped != null && mapped !== "developer";
}

export function enterprisePermissionsForPrincipal(
  principal: Pick<EnterprisePrincipal, "role" | "permissions">
): readonly EnterprisePermission[] {
  const role = mapEnterpriseRole(principal.role);
  if (!role) return [];
  const rolePermissions = ROLE_PERMISSIONS[role];
  if (!principal.permissions?.length) return rolePermissions;
  const explicit = new Set(principal.permissions);
  return rolePermissions.filter((permission) => explicit.has(permission));
}

export function authorizeEnterprise(
  principal: EnterprisePrincipal,
  permission: EnterprisePermission,
  resource?: AuthorizationResource
): boolean {
  if (principal.status !== "active") return false;
  if (resource && resource.organizationId !== principal.organizationId) return false;

  const permissions = enterprisePermissionsForPrincipal(principal);
  if (!permissions.includes(permission)) return false;

  const role = mapEnterpriseRole(principal.role);
  if (!role) return false;

  if (role === "developer") {
    if (resource?.environment === "production" && permission !== "resources.read") {
      return false;
    }
    if (
      permission === "changes.approve" ||
      permission === "security_settings.manage" ||
      permission === "audit.read_sensitive" ||
      permission === "credentials.manage" ||
      permission === "features.manage" ||
      permission === "schemas.review" ||
      permission === "schemas.publish" ||
      permission === "resources.write_production" ||
      permission === "domains.manage" ||
      permission === "deployments.manage" ||
      permission === "collections.manage" ||
      permission === "query_analytics.read_sensitive" ||
      permission === "unanswered_queries.read_sensitive" ||
      permission === "unanswered_queries.export" ||
      permission === "unanswered_queries.manage"
    ) {
      return false;
    }
  }

  return true;
}

export function requireEnterprisePermission(
  principal: EnterprisePrincipal,
  permission: EnterprisePermission,
  resource?: AuthorizationResource
): void {
  if (!authorizeEnterprise(principal, permission, resource)) {
    throw new EnterpriseAuthorizationError();
  }
}

export class EnterpriseAuthorizationError extends Error {
  readonly code = "FORBIDDEN";

  constructor() {
    super("The requested operation is not permitted");
    this.name = "EnterpriseAuthorizationError";
  }
}
