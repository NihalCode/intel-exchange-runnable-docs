import { NextRequest, NextResponse } from "next/server";

import { getAuthCookieDomain } from "@/lib/auth0-management/invite-provision";
import { resolveAppBaseUrlFromEnv } from "@/lib/documentation-auth/base-url";
import {
  auth0LogoutToOriginPath,
  encodeFreshLoginCookie,
  FRESH_LOGIN_COOKIE,
  FRESH_LOGIN_START_PATH,
  freshLoginCookieOptions,
  freshLoginNeedsCanonicalHost,
  normalizeLogoutOrigin,
  resolveFreshLoginLogoutOrigin,
  sanitizeFreshLoginReturnTo,
} from "@/lib/documentation-auth/fresh-login";

export const runtime = "nodejs";

/**
 * Clear sticky Auth0/MFA session without Oops:
 * logout returnTo = exact app origin (Allowed Logout URLs), then proxy
 * continues into Okta broker login with prompt=login.
 *
 * If the user hits an alias host (e.g. *.vercel.app) while APP_BASE_URL is the
 * canonical product host, bounce onto that host first so `cyware_fresh_login`
 * is set where Auth0 will land after logout — otherwise Sign in stops on `/`.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const modeParam = request.nextUrl.searchParams.get("mode")?.trim();
  const mode = modeParam === "signup" ? "signup" : "login";
  const returnTo = sanitizeFreshLoginReturnTo(
    request.nextUrl.searchParams.get("returnTo")
  );
  const requestOrigin = normalizeLogoutOrigin(request.nextUrl.origin);
  const origin = resolveFreshLoginLogoutOrigin(
    requestOrigin,
    resolveAppBaseUrlFromEnv()
  );

  if (freshLoginNeedsCanonicalHost(requestOrigin, origin)) {
    const canonical = new URL(
      `${FRESH_LOGIN_START_PATH}${request.nextUrl.search}`,
      `${origin}/`
    );
    return NextResponse.redirect(canonical);
  }

  const logoutPath = auth0LogoutToOriginPath(origin);
  const response = NextResponse.redirect(new URL(logoutPath, origin));
  response.cookies.set(
    FRESH_LOGIN_COOKIE,
    encodeFreshLoginCookie(mode, returnTo),
    freshLoginCookieOptions(origin.startsWith("https://"), getAuthCookieDomain())
  );
  return response;
}
