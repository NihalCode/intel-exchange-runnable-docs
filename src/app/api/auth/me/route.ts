import { NextResponse } from "next/server";

import {
  accessDeniedPath,
  sessionToJson,
} from "@/lib/documentation-auth/session";
import { canAccessEnterpriseAdminNav } from "@/lib/documentation-auth/permissions";
import { resolveWorkspaceSession } from "@/lib/documentation-auth/workspace-session";
import { evaluateAdminAccess } from "@/lib/enterprise/admin-access";

export const runtime = "nodejs";

export async function GET() {
  const workspaceResult = await resolveWorkspaceSession();
  if (workspaceResult.ok) {
    const { workspace } = workspaceResult;
    const access = await evaluateAdminAccess(workspace.session);
    return NextResponse.json({
      auth0Authenticated: true,
      ...sessionToJson(workspace.session),
      enterpriseCapabilities: workspace.enterpriseCapabilities,
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
    return NextResponse.json({
      auth0Authenticated: true,
      ...sessionToJson(result.session),
      enterpriseCapabilities: navCapabilities,
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
    user: null,
  });
}
