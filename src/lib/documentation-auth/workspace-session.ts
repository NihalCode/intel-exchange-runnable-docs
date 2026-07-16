import "server-only";

import type { NextRequest } from "next/server";

import {
  getAppSessionResult,
  type AppSession,
  type AppSessionResult,
} from "@/lib/documentation-auth/session";
import { permissionsForRole } from "@/lib/documentation-auth/permissions";
import type { DocumentationPermission } from "@/lib/documentation-auth/types";
import { resolveOrganizationContext } from "@/lib/enterprise/organization-context";
import type { OrganizationContext } from "@/lib/enterprise/types";
import { authorizeEnterprise, enterprisePermissionsForPrincipal } from "@/lib/enterprise/policy";
import { ENTERPRISE_PERMISSIONS, type EnterprisePermission } from "@/lib/enterprise/types";

export interface WorkspaceSession {
  session: AppSession;
  organization: OrganizationContext;
  permissions: readonly DocumentationPermission[];
  enterpriseCapabilities: EnterprisePermission[];
}

export async function resolveWorkspaceSession(
  request?: NextRequest
): Promise<{ ok: true; workspace: WorkspaceSession } | { ok: false; result: AppSessionResult }> {
  const result = await getAppSessionResult(request);
  if (!result.session) {
    return { ok: false, result };
  }
  try {
    const organization = await resolveOrganizationContext(result.session);
    const permissions = permissionsForRole(result.session.user.role);
    const enterpriseCapabilities = ENTERPRISE_PERMISSIONS.filter((permission) =>
      authorizeEnterprise(organization.principal, permission, {
        organizationId: organization.organization.id,
      })
    );
    return {
      ok: true,
      workspace: {
        session: result.session,
        organization,
        permissions,
        enterpriseCapabilities,
      },
    };
  } catch {
    return { ok: false, result: { session: null, auth0Authenticated: true } };
  }
}

export function workspaceHasPermission(
  workspace: WorkspaceSession,
  permission: DocumentationPermission
): boolean {
  return workspace.permissions.includes(permission);
}

export function workspaceEnterprisePermissions(workspace: WorkspaceSession): readonly EnterprisePermission[] {
  return enterprisePermissionsForPrincipal(workspace.organization.principal);
}
