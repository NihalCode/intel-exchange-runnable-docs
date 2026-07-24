import { NextRequest, NextResponse } from "next/server";

import { resolveAppBaseUrlFromEnv } from "@/lib/documentation-auth/base-url";
import {
  auth0LogoutToOriginPath,
  MFA_STEP_UP_COOKIE,
  mfaStepUpCookieOptions,
  normalizeLogoutOrigin,
} from "@/lib/enterprise/mfa-step-up";

export const runtime = "nodejs";

function safeReturnTo(value: string | null): string {
  const raw = value?.trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/admin";
  return raw;
}

function logoutOriginForRequest(request: NextRequest): string {
  const configured = resolveAppBaseUrlFromEnv();
  const requestOrigin = normalizeLogoutOrigin(request.nextUrl.origin);
  if (configured && configured === requestOrigin) return configured;
  // Prefer the configured deployment origin so Auth0 Allowed Logout URLs match.
  if (configured) return configured;
  return requestOrigin;
}

/**
 * Bridge for admin MFA step-up:
 * 1) Remember where to land after MFA (`returnTo` cookie)
 * 2) Clear the Auth0/app session with logout returnTo = exact app origin
 * 3) Proxy then starts `/auth/login?connection=…&prompt=login&max_age=0` (Okta Verify)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo"));
  const origin = logoutOriginForRequest(request);
  const logoutPath = auth0LogoutToOriginPath(origin);
  const response = NextResponse.redirect(new URL(logoutPath, request.url));
  response.cookies.set(
    MFA_STEP_UP_COOKIE,
    returnTo,
    mfaStepUpCookieOptions(origin.startsWith("https://"))
  );
  return response;
}
