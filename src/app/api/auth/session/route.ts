import { NextResponse } from "next/server";

import {
  accessDeniedPath,
  getAppSessionResult,
  sessionToJson,
} from "@/lib/documentation-auth/session";

export const runtime = "nodejs";

/** Bootstrap documentation session after Auth0 login. */
export async function POST() {
  const result = await getAppSessionResult();
  if (result.session) {
    return NextResponse.json({
      ok: true,
      ...sessionToJson(result.session),
    });
  }

  if (result.accessDenied) {
    return NextResponse.json(
      {
        ok: false,
        authenticated: false,
        auth0Authenticated: Boolean(result.auth0Authenticated),
        accessDenied: result.accessDenied,
        redirectTo: accessDeniedPath(result.accessDenied.reason),
      },
      { status: 403 }
    );
  }

  return NextResponse.json({ ok: false, authenticated: false }, { status: 401 });
}

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
    accessDenied: result.accessDenied ?? null,
    permissions: [],
    user: null,
  });
}
