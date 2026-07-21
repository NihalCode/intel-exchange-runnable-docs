import { NextResponse } from "next/server";

import {
  accessDeniedPath,
  sessionToJson,
} from "@/lib/documentation-auth/session";
import {
  canAccessEnterpriseAdminNav,
  hasPermission,
} from "@/lib/documentation-auth/permissions";
import type { DocumentationRole } from "@/lib/documentation-auth/types";
import { resolveWorkspaceSession } from "@/lib/documentation-auth/workspace-session";
import { evaluateAdminAccess } from "@/lib/enterprise/admin-access";
import { resolveOrganizationContext } from "@/lib/enterprise/organization-context";
import { isDocumentationFeatureEnabled } from "@/lib/documentation-features";

export const runtime = "nodejs";

async function resolveCanAskAi(session: {
  user: { id: string; role: string };
}): Promise<boolean> {
  if (!hasPermission(session.user.role as DocumentationRole, "ask_agent")) {
    return false;
  }
  try {
    const context = await resolveOrganizationContext(session as never);
    const assistantOn = await isDocumentationFeatureEnabled({
      organizationId: context.organization.id,
      key: "ai_documentation_assistant",
      role: context.principal.role,
    });
    if (!assistantOn) return false;
    if (context.principal.role !== "viewer") return true;
    return isDocumentationFeatureEnabled({
      organizationId: context.organization.id,
      key: "viewer_ask_ai_access_enabled",
      role: context.principal.role,
    });
  } catch {
    return session.user.role !== "viewer";
  }
}

export async function GET() {
  const workspaceResult = await resolveWorkspaceSession();
  if (workspaceResult.ok) {
    const { workspace } = workspaceResult;
    const access = await evaluateAdminAccess(workspace.session);
    const canAskAi = await resolveCanAskAi(workspace.session);
    return NextResponse.json({
      auth0Authenticated: true,
      ...sessionToJson(workspace.session),
      enterpriseCapabilities: workspace.enterpriseCapabilities,
      canAskAi,
      adminAccess: access.allowed
        ? { allowed: true }
        : {
            allowed: false,
            reason: access.reason ?? "missing_permission",
          },
    });
  }

  const result = workspaceResult.result;
  if (result.session) {
    const access = await evaluateAdminAccess(result.session);
    const navCapabilities = access.allowed
      ? ["admin_dashboard.access"]
      : canAccessEnterpriseAdminNav(result.session.user.role)
        ? ["admin_dashboard.access"]
        : [];
    const canAskAi = await resolveCanAskAi(result.session);
    return NextResponse.json({
      auth0Authenticated: true,
      ...sessionToJson(result.session),
      enterpriseCapabilities: navCapabilities,
      canAskAi,
      adminAccess: access.allowed
        ? { allowed: true }
        : {
            allowed: false,
            reason: access.reason ?? "missing_permission",
          },
    });
  }

  return NextResponse.json({
    authenticated: false,
    auth0Authenticated: Boolean(result.auth0Authenticated),
    accessDenied: result.accessDenied
      ? { ...result.accessDenied, redirectTo: accessDeniedPath(result.accessDenied.reason) }
      : null,
    permissions: [],
    enterpriseCapabilities: [],
    canAskAi: false,
    user: null,
  });
}
