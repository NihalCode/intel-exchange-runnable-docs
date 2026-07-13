import "server-only";

import type { AppSession } from "@/lib/documentation-auth/session";
import { checkStepUpAuthentication } from "@/lib/enterprise/auth-assurance";
import {
  OrganizationContextError,
  resolveOrganizationContext,
} from "@/lib/enterprise/organization-context";
import { authorizeEnterprise, mapEnterpriseRole } from "@/lib/enterprise/policy";
import type { OrganizationContext } from "@/lib/enterprise/types";

export type AdminAccessDenialReason =
  | "no_session"
  | "organization_context"
  | "inactive_principal"
  | "missing_permission"
  | "mfa_required"
  | "recent_auth_required";

export interface AdminAccessEvaluation {
  allowed: boolean;
  reason?: AdminAccessDenialReason;
  organizationContext?: OrganizationContext;
  workspaceRole?: string;
  enterpriseRole?: string | null;
  mfaMethods?: string[];
}

export async function evaluateAdminAccess(
  session: AppSession | null
): Promise<AdminAccessEvaluation> {
  if (!session) {
    return { allowed: false, reason: "no_session" };
  }

  let organizationContext: OrganizationContext;
  try {
    organizationContext = await resolveOrganizationContext(session);
  } catch (error) {
    if (error instanceof OrganizationContextError) {
      return {
        allowed: false,
        reason: "organization_context",
        workspaceRole: session.user.role,
        enterpriseRole: mapEnterpriseRole(session.user.role),
      };
    }
    throw error;
  }

  if (organizationContext.principal.status !== "active") {
    return {
      allowed: false,
      reason: "inactive_principal",
      organizationContext,
      workspaceRole: session.user.role,
      enterpriseRole: mapEnterpriseRole(organizationContext.principal.role),
    };
  }

  if (
    !authorizeEnterprise(organizationContext.principal, "admin_dashboard.access", {
      organizationId: organizationContext.organization.id,
    })
  ) {
    return {
      allowed: false,
      reason: "missing_permission",
      organizationContext,
      workspaceRole: session.user.role,
      enterpriseRole: mapEnterpriseRole(organizationContext.principal.role),
    };
  }

  const assurance = checkStepUpAuthentication(session, { requireMfa: true });
  if (!assurance.ok) {
    return {
      allowed: false,
      reason: assurance.reason ?? "mfa_required",
      organizationContext,
      workspaceRole: session.user.role,
      enterpriseRole: mapEnterpriseRole(organizationContext.principal.role),
      mfaMethods: session.claims?.amr,
    };
  }

  return {
    allowed: true,
    organizationContext,
    workspaceRole: session.user.role,
    enterpriseRole: mapEnterpriseRole(organizationContext.principal.role),
    mfaMethods: session.claims?.amr,
  };
}
