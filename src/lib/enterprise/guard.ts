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
  resolveOrganizationContextOrBootstrap,
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
  /**
   * Opt-in only. Prefer Auth0 MFA at login + role checks for the session lifetime.
   * Do not use for routine admin work — that causes repetitive re-auth.
   */
  requireMfa?: boolean;
  /** Opt-in only. Prefer session lifetime over short re-auth windows. */
  maxAuthAgeSeconds?: number;
}

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function forbidden(): NextResponse {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/**
 * Authorize by active session + enterprise role/permission.
 * MFA is expected at Auth0 login when the tenant requires it; this guard does
 * not re-challenge MFA or force re-login for normal admin APIs.
 */
export async function guardEnterpriseApi(
  request: NextRequest,
  permission: EnterprisePermission | readonly EnterprisePermission[],
  options: EnterpriseGuardOptions = {}
): Promise<EnterpriseAccess | NextResponse> {
  const result = await getAppSessionResult(request);
  if (!result.session) {
    return result.auth0Authenticated || result.accessDenied ? forbidden() : unauthorized();
  }

  try {
    const context = await resolveOrganizationContextOrBootstrap(result.session);
    const resource = options.resource ?? {
      organizationId: context.organization.id,
    };
    const required = Array.isArray(permission) ? permission : [permission];
    const allowed = required.some((p) =>
      authorizeEnterprise(context.principal, p, resource)
    );
    if (!allowed) {
      return forbidden();
    }

    if (options.requireMfa || options.maxAuthAgeSeconds != null) {
      const assurance = checkStepUpAuthentication(result.session, {
        requireMfa: options.requireMfa === true,
        maxAuthAgeSeconds: options.maxAuthAgeSeconds,
      });
      if (!assurance.ok) {
        return NextResponse.json(
          {
            error:
              assurance.reason === "mfa_required"
                ? "MFA is required for this action. Sign out and complete authenticator MFA at sign-in."
                : "This action requires a fresh sign-in. Sign out and sign in again.",
            code:
              assurance.reason === "mfa_required"
                ? "MFA_REQUIRED"
                : "RECENT_AUTH_REQUIRED",
          },
          { status: 403 }
        );
      }
    }

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
