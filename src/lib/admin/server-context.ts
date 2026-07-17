import "server-only";

import { getAppSession } from "@/lib/documentation-auth/session";
import { resolveOrganizationContextOrBootstrap } from "@/lib/enterprise/organization-context";
import { authorizeEnterprise } from "@/lib/enterprise/policy";
import { ENTERPRISE_PERMISSIONS, type EnterprisePermission } from "@/lib/enterprise/types";

export interface AdminServerContext {
  organization: { id: string; name: string; slug: string };
  user: { id: string; email: string; role: string };
  capabilities: EnterprisePermission[];
}

export async function loadAdminServerContext(): Promise<AdminServerContext | null> {
  const session = await getAppSession();
  if (!session) return null;
  let context;
  try {
    context = await resolveOrganizationContextOrBootstrap(session);
  } catch {
    return null;
  }
  const capabilities = ENTERPRISE_PERMISSIONS.filter((permission) =>
    authorizeEnterprise(context.principal, permission, {
      organizationId: context.organization.id,
    })
  );
  return {
    organization: {
      id: context.organization.id,
      name: context.organization.name,
      slug: context.organization.slug,
    },
    user: {
      id: context.principal.userId,
      email: session.user.email,
      role: context.principal.role,
    },
    capabilities,
  };
}

export function hasCapability(
  capabilities: readonly EnterprisePermission[],
  permission: EnterprisePermission
): boolean {
  return capabilities.includes(permission);
}
