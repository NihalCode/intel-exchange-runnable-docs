import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  getAppSessionResult,
  type AppSession,
} from "@/lib/documentation-auth/session";
import { checkStepUpAuthentication } from "@/lib/enterprise/auth-assurance";
import {
  authorizeEnterprise,
  type EnterpriseAuthorizationError,
} from "@/lib/enterprise/policy";
import {
  OrganizationContextError,
  resolveOrganizationContext,
} from "@/lib/enterprise/organization-context";
import type {
  AuthorizationResource,
  EnterprisePermission,
  OrganizationContext,
} from "@/lib/enterprise/types";

export interface EnterpriseAccess {
  session: AppSession;
  context: OrganizationContext;
}

export interface EnterpriseGuardOptions {
  resource?: AuthorizationResource;
  requireMfa?: boolean;
  maxAuthAgeSeconds?: number;
}

const SENSITIVE_PERMISSIONS = new Set<EnterprisePermission>([
  "resources.write_production",
  "changes.approve",
  "changes.activate",
  "changes.rollback",
  "credentials.manage",
  "security_settings.manage",
  "jobs.manage",
  "audit.read_sensitive",
]);

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function forbidden(): NextResponse {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function guardEnterpriseApi(
  request: NextRequest,
  permission: EnterprisePermission,
  options: EnterpriseGuardOptions = {}
): Promise<EnterpriseAccess | NextResponse> {
  const result = await getAppSessionResult(request);
  if (!result.session) {
    return result.auth0Authenticated || result.accessDenied ? forbidden() : unauthorized();
  }

  try {
    const context = await resolveOrganizationContext(result.session);
    const resource = options.resource ?? {
      organizationId: context.organization.id,
    };
    if (!authorizeEnterprise(context.principal, permission, resource)) {
      return forbidden();
    }
    const sensitive =
      SENSITIVE_PERMISSIONS.has(permission) ||
      (permission === "resources.write" &&
        resource.environment === "production");
    const assurance = checkStepUpAuthentication(result.session, {
      requireMfa: sensitive || options.requireMfa,
      maxAuthAgeSeconds:
        options.maxAuthAgeSeconds ?? (sensitive ? 10 * 60 : undefined),
    });
    if (!assurance.ok) return forbidden();
    return { session: result.session, context };
  } catch (error) {
    if (
      error instanceof OrganizationContextError ||
      (error as EnterpriseAuthorizationError)?.name ===
        "EnterpriseAuthorizationError"
    ) {
      return forbidden();
    }
    throw error;
  }
}

export async function guardAdminDashboard(
  request: NextRequest
): Promise<EnterpriseAccess | NextResponse> {
  return guardEnterpriseApi(request, "admin_dashboard.access");
}
