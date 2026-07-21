import { NextRequest, NextResponse } from "next/server";

import type { DocumentationPermission } from "@/lib/documentation-auth/types";
import {
  getAppSessionResult,
  requirePermission,
  requireSession,
  type AppSession,
} from "@/lib/documentation-auth/session";
import { isAuthEnabled } from "@/lib/documentation-auth/config";
import { verifyDeveloperRequest } from "@/lib/developer/access";
import { canUseAgentWithoutStoredProductSecrets } from "@/lib/documentation-credentials/agent-access-policy";
import { isDocumentationFeatureEnabled } from "@/lib/documentation-features";
import type { DocumentationFeatureKey } from "@/lib/documentation-features";
import { resolveOrganizationContext } from "@/lib/enterprise/organization-context";

/** Guard documentation API routes with invite-only session + optional permission. */
export async function guardDocumentationApi(
  request: NextRequest,
  permission?: DocumentationPermission
): Promise<AppSession | NextResponse> {
  if (!isAuthEnabled()) {
    const dev = verifyDeveloperRequest(request);
    if (!dev.ok) {
      return NextResponse.json({ ok: false, error: dev.error }, { status: dev.status });
    }
    return {
      user: {
        id: "developer-token",
        auth0UserId: "developer-token",
        email: "developer@local",
        name: "Developer",
        role: "developer",
        status: "active",
      },
      authProvider: "disabled",
    };
  }

  if (permission) {
    return requirePermission(permission, request);
  }
  return requireSession(request);
}

export async function guardReadDocs(request: NextRequest): Promise<AppSession | NextResponse> {
  return guardDocumentationApi(request, "read_docs");
}

export async function guardAskAgent(request: NextRequest): Promise<AppSession | NextResponse> {
  const session = await guardDocumentationApi(request, "ask_agent");
  if (session instanceof NextResponse) return session;
  // Disabling Auth0 is itself an explicit local-development mode. It never
  // applies in production because production configuration requires Auth0.
  if (!isAuthEnabled() && process.env.NODE_ENV !== "production") return session;
  try {
    const context = await resolveOrganizationContext(session);
    const enabled = await isDocumentationFeatureEnabled({
      organizationId: context.organization.id,
      key: "ai_documentation_assistant",
      role: context.principal.role,
    });
    if (!enabled) {
      return NextResponse.json(
        { error: "Feature unavailable", code: "FEATURE_DISABLED" },
        { status: 403 }
      );
    }
    const access = await canUseAgentWithoutStoredProductSecrets({
      organizationId: context.organization.id,
      userId: session.user.id,
      role: context.principal.role,
    });
    if (!access.allowed) {
      return NextResponse.json(
        {
          error: "Authentication required",
          code: "PRODUCT_AUTH_REQUIRED",
          action: "/authentication",
        },
        { status: 403 }
      );
    }
    return session;
  } catch {
    return NextResponse.json(
      {
        error: "Authentication required",
        code: "PRODUCT_AUTH_REQUIRED",
        action: "/authentication",
      },
      { status: 403 }
    );
  }
}

export async function guardAgentFeature(
  request: NextRequest,
  key: DocumentationFeatureKey
): Promise<AppSession | NextResponse> {
  const session = await guardAskAgent(request);
  if (session instanceof NextResponse) return session;
  if (!isAuthEnabled() && process.env.NODE_ENV !== "production") return session;
  try {
    const context = await resolveOrganizationContext(session);
    const enabled = await isDocumentationFeatureEnabled({
      organizationId: context.organization.id,
      key,
      role: context.principal.role,
    });
    return enabled
      ? session
      : NextResponse.json(
          { error: "Feature unavailable", code: "FEATURE_DISABLED" },
          { status: 403 }
        );
  } catch {
    return NextResponse.json(
      { error: "Feature unavailable", code: "FEATURE_DISABLED" },
      { status: 403 }
    );
  }
}

export async function guardDeveloperDiagnostics(
  request: NextRequest
): Promise<AppSession | NextResponse> {
  if (!isAuthEnabled()) {
    const dev = verifyDeveloperRequest(request);
    if (!dev.ok) {
      return NextResponse.json({ ok: false, error: dev.error }, { status: dev.status });
    }
    return {
      user: {
        id: "developer-token",
        auth0UserId: "developer-token",
        email: "developer@local",
        name: "Developer",
        role: "developer",
        status: "active",
      },
      authProvider: "disabled",
    };
  }
  return requirePermission("view_technical_diagnostics", request);
}

export async function guardSyncDocs(
  request: NextRequest
): Promise<AppSession | NextResponse> {
  return guardDocumentationApi(request, "sync_docs");
}

export async function guardManageSources(
  request: NextRequest
): Promise<AppSession | NextResponse> {
  return guardDocumentationApi(request, "manage_sources");
}

export async function getSessionOrDenied(request: NextRequest) {
  return getAppSessionResult(request);
}
