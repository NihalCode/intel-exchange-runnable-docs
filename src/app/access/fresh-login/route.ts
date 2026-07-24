import { NextRequest, NextResponse } from "next/server";

import { resolveAppBaseUrlFromEnv } from "@/lib/documentation-auth/base-url";
import {
  auth0LogoutToOriginPath,
  encodeFreshLoginCookie,
  FRESH_LOGIN_COOKIE,
  freshLoginCookieOptions,
  normalizeLogoutOrigin,
  sanitizeFreshLoginReturnTo,
} from "@/lib/documentation-auth/fresh-login";

export const runtime = "nodejs";

function logoutOriginForRequest(request: NextRequest): string {
  const configured = resolveAppBaseUrlFromEnv();
  const requestOrigin = normalizeLogoutOrigin(request.nextUrl.origin);
  if (configured && configured === requestOrigin) return configured;
  if (configured) return configured;
  return requestOrigin;
}

/**
 * Clear sticky Auth0/MFA session without Oops:
 * logout returnTo = exact app origin (Allowed Logout URLs), then proxy
 * continues into Database email/password login with prompt=login.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const modeParam = request.nextUrl.searchParams.get("mode")?.trim();
  const mode = modeParam === "signup" ? "signup" : "login";
  const returnTo = sanitizeFreshLoginReturnTo(
    request.nextUrl.searchParams.get("returnTo")
  );
  const origin = logoutOriginForRequest(request);
  const logoutPath = auth0LogoutToOriginPath(origin);
  const response = NextResponse.redirect(new URL(logoutPath, request.url));
  response.cookies.set(
    FRESH_LOGIN_COOKIE,
    encodeFreshLoginCookie(mode, returnTo),
    freshLoginCookieOptions(origin.startsWith("https://"))
  );
  return response;
}
