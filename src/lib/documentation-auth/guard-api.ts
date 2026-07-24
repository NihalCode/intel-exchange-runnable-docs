import { NextRequest, NextResponse } from "next/server";

import type { DocumentationPermission } from "@/lib/documentation-auth/types";
import {
  getAppSessionResult,
  requirePermission,
  requireSession,
  type AppSession,
} from "@/lib/documentation-auth/session";
import {
  anonymousViewerSession,
  isAnonymousViewerSession,
} from "@/lib/documentation-auth/anonymous-viewer";
import { isAuthEnabled } from "@/lib/documentation-auth/config";
import { verifyDeveloperRequest } from "@/lib/developer/access";
import { DEVELOPER_ACCESS_UNAVAILABLE_MESSAGE } from "@/lib/user-facing-errors";
import { canUseAgentWithoutStoredProductSecrets } from "@/lib/documentation-credentials/agent-access-policy";
import { isDocumentationFeatureEnabled } from "@/lib/documentation-features";
import type { DocumentationFeatureKey } from "@/lib/documentation-features";
import { resolveOrganizationContext } from "@/lib/enterprise/organization-context";
import { resolveViewerAskAiAccessEnabled } from "@/lib/domains/feature-gates-resolve";
import type { DocumentationRole } from "@/lib/documentation-auth/types";

function testRoleFromRequest(request: NextRequest): DocumentationRole | null {
  const header = request.headers.get("x-test-role")?.trim();
  const roles: DocumentationRole[] = [
    "owner",
    "admin",
    "documentation_manager",
    "developer",
    "viewer",
  ];
  if (header && roles.includes(header as DocumentationRole)) {
    return header as DocumentationRole;
  }
  return null;
}

/** Guard documentation API routes with invite-only session + optional permission. */
export async function guardDocumentationApi(
  request: NextRequest,
  permission?: DocumentationPermission
): Promise<AppSession | NextResponse> {
  if (!isAuthEnabled()) {
    const testRole = testRoleFromRequest(request);
    if (testRole) {
      return {
        user: {
          id: `local-dev-${testRole}`,
          auth0UserId: `auth0|local-dev-${testRole}`,
          email: `${testRole}@dev.local`,
          name: `Local ${testRole}`,
          role: testRole,
          status: "active",
        },
        authProvider: "disabled",
      };
    }
    // Local preview (AUTH_DISABLED): allow docs + Ask AI without a developer token.
    if (process.env.NODE_ENV !== "production") {
      const local = await getAppSessionResult(request);
      if (local.session) return local.session;
    }
    const dev = verifyDeveloperRequest(request);
    if (!dev.ok) {
      return NextResponse.json(
        { ok: false, error: DEVELOPER_ACCESS_UNAVAILABLE_MESSAGE },
        { status: dev.status }
      );
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
  // Unsigned viewers may use Ask AI chat (snippets/run stay gated elsewhere).
  if (isAuthEnabled()) {
    const result = await getAppSessionResult(request);
    if (!result.session) {
      return anonymousViewerSession();
    }
  }

  const session = await guardDocumentationApi(request, "ask_agent");
  if (session instanceof NextResponse) return session;
  if (isAnonymousViewerSession(session)) return session;

  // Local AUTH_DISABLED: still honor x-test-role Viewer gate for parity with production.
  if (!isAuthEnabled() && process.env.NODE_ENV !== "production") {
    if (session.user.role === "viewer") {
      try {
        const context = await resolveOrganizationContext(session);
        const viewerAllowed = await resolveViewerAskAiAccessEnabled({
          organizationId: context.organization.id,
          role: "viewer",
        });
        if (!viewerAllowed) {
          return NextResponse.json(
            {
              error: "Ask AI is not enabled for Viewer accounts",
              code: "VIEWER_ASK_AI_DISABLED",
            },
            { status: 403 }
          );
        }
      } catch {
        return NextResponse.json(
          {
            error: "Ask AI is not enabled for Viewer accounts",
            code: "VIEWER_ASK_AI_DISABLED",
          },
          { status: 403 }
        );
      }
    }
    return session;
  }
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

    // Signed-in Viewer Ask AI is opt-in via feature flag (default OFF).
    // Anonymous viewers are handled above and do not hit this branch.
    if (context.principal.role === "viewer" || session.user.role === "viewer") {
      const viewerAllowed = await resolveViewerAskAiAccessEnabled({
        organizationId: context.organization.id,
        role: "viewer",
      });
      if (!viewerAllowed) {
        return NextResponse.json(
          {
            error: "Ask AI is not enabled for Viewer accounts",
            code: "VIEWER_ASK_AI_DISABLED",
          },
          { status: 403 }
        );
      }
      // Viewers never manage credentials — allow Ask AI without stored product secrets.
      return session;
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
      return NextResponse.json(
        { ok: false, error: DEVELOPER_ACCESS_UNAVAILABLE_MESSAGE },
        { status: dev.status }
      );
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
