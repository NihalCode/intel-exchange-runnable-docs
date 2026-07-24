import { NextResponse } from "next/server";

import {
  CSRF_COOKIE_NAME,
  createCsrfToken,
  csrfCookieOptions,
} from "@/lib/enterprise/csrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Issue a double-submit CSRF cookie.
 *
 * Session is intentionally not required: unsigned Ask AI viewers and freshly
 * signed-in clients both need a token before their first mutation. Mutating
 * routes still enforce CSRF + their own auth guards.
 */
export async function GET() {
  const csrfToken = createCsrfToken();
  const response = NextResponse.json({ csrfToken });
  response.cookies.set(CSRF_COOKIE_NAME, csrfToken, csrfCookieOptions());
  return response;
}
