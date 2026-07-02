import { NextResponse } from "next/server";

import {
  accessDeniedPath,
  getAppSessionResult,
  sessionToJson,
} from "@/lib/documentation-auth/session";

export const runtime = "nodejs";

export async function GET() {
  const result = await getAppSessionResult();
  if (result.session) {
    return NextResponse.json({
      auth0Authenticated: true,
      ...sessionToJson(result.session),
    });
  }

  return NextResponse.json({
    authenticated: false,
    auth0Authenticated: Boolean(result.auth0Authenticated),
    accessDenied: result.accessDenied
      ? { ...result.accessDenied, redirectTo: accessDeniedPath(result.accessDenied.reason) }
      : null,
    permissions: [],
    user: null,
  });
}
