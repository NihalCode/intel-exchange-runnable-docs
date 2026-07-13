import { NextResponse } from "next/server";

import {
  accessDeniedPath,
  getAppSessionResult,
  sessionToJson,
} from "@/lib/documentation-auth/session";
import { resolveOrganizationContext } from "@/lib/enterprise/organization-context";
import { authorizeEnterprise } from "@/lib/enterprise/policy";

export const runtime = "nodejs";

export async function GET() {
  const result = await getAppSessionResult();
  if (result.session) {
    let enterpriseCapabilities: string[] = [];
    try {
      const context = await resolveOrganizationContext(result.session);
      if (
        authorizeEnterprise(context.principal, "admin_dashboard.access", {
          organizationId: context.organization.id,
        })
      ) {
        enterpriseCapabilities = ["admin_dashboard.access"];
      }
    } catch {
      // The regular documentation session remains valid without enterprise context.
    }
    return NextResponse.json({
      auth0Authenticated: true,
      ...sessionToJson(result.session),
      enterpriseCapabilities,
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
