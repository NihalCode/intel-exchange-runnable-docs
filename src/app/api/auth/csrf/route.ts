import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { isAuthEnabled } from "@/lib/documentation-auth/config";
import { getAppSessionResult } from "@/lib/documentation-auth/session";
import {
  CSRF_COOKIE_NAME,
  createCsrfToken,
  csrfCookieOptions,
} from "@/lib/enterprise/csrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Issue a double-submit CSRF cookie for authenticated (or auth-disabled) clients. */
export async function GET(request: NextRequest) {
  if (isAuthEnabled()) {
    const result = await getAppSessionResult(request);
    if (!result.session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const csrfToken = createCsrfToken();
  const response = NextResponse.json({ csrfToken });
  response.cookies.set(CSRF_COOKIE_NAME, csrfToken, csrfCookieOptions());
  return response;
}
