import { NextResponse } from "next/server";

import {
  accessDeniedPath,
  getAppSessionResult,
  sessionToJson,
} from "@/lib/documentation-auth/session";
import { evaluateAdminAccess } from "@/lib/enterprise/admin-access";

export const runtime = "nodejs";

export async function GET() {
  const result = await getAppSessionResult();
  if (result.session) {
    const access = await evaluateAdminAccess(result.session);
    const enterpriseCapabilities = access.allowed ? ["admin_dashboard.access"] : [];
    return NextResponse.json({
      auth0Authenticated: true,
      ...sessionToJson(result.session),
      enterpriseCapabilities,
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
