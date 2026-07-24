import type { NextRequest } from "next/server";

import { createAuthReturnTarget } from "@/lib/documentation-auth/auth-return-target";
import { getStaticDomainConfig } from "@/lib/domains/env-config";
import { isCrossDomainSsoEnabled } from "@/lib/domains/feature-gates";
import { normalizeHostname } from "@/lib/domains/normalize";
import { trustedRequestHostname } from "@/lib/domains/request-host";
import { authSignInUrl } from "@/lib/domains/urls";

import { getOktaBrokerConnection } from "@/lib/documentation-auth/password-connection";

function returnToFromRequest(request: NextRequest): string {
  const referer = request.headers.get("referer");
  let returnTo = request.nextUrl.pathname + request.nextUrl.search;
  if (referer) {
    try {
      const refUrl = new URL(referer);
      if (refUrl.origin === request.nextUrl.origin) {
        returnTo = refUrl.pathname + refUrl.search;
      }
    } catch {
      /* ignore malformed Referer */
    }
  }
  if (!returnTo.startsWith("/") || returnTo.startsWith("//")) return "/";
  // Avoid bouncing auth routes back into themselves.
  if (
    returnTo.startsWith("/sign-in") ||
    returnTo.startsWith("/sign-up") ||
    returnTo.startsWith("/auth/") ||
    returnTo.startsWith("/post-login") ||
    returnTo.startsWith("/access/")
  ) {
    return "/";
  }
  return returnTo;
}

/** Same-origin Auth0 login — always includes AUTH0_OKTA_CONNECTION. */
export function auth0LoginPath(returnTo = "/"): string {
  const path = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
  const connection = getOktaBrokerConnection();
  if (!connection) {
    // Fail closed to branded setup page — never authorize without Okta connection.
    const params = new URLSearchParams({
      error: "auth_config",
      returnTo: path,
    });
    return `/sign-in?${params.toString()}`;
  }
  const params = new URLSearchParams({
    returnTo: path,
    connection,
  });
  return `/auth/login?${params.toString()}`;
}

/**
 * Builds a sign-in URL for the current request.
 * Prefers `/auth/login` so Auth0 can silently resume SSO across product hosts
 * after the first MFA/password login (one Auth0 session → one silent authorize per app origin).
 * When cross-domain SSO + AUTH_DOMAIN are configured, sends the user to the central auth origin.
 */
export async function buildSignInUrl(request: NextRequest): Promise<string> {
  const returnTo = returnToFromRequest(request);

  if (isCrossDomainSsoEnabled()) {
    const config = getStaticDomainConfig();
    const authHost = config.auth?.trim();
    if (authHost) {
      const currentHost = trustedRequestHostname(request);
      const normalizedAuth = normalizeHostname(authHost, { allowPrivateHosts: true });
      const normalizedCurrent = normalizeHostname(currentHost, { allowPrivateHosts: true });
      const authHostname = normalizedAuth.ok ? normalizedAuth.hostname : authHost.toLowerCase();
      const currentHostname = normalizedCurrent.ok
        ? normalizedCurrent.hostname
        : currentHost.toLowerCase();

      if (currentHostname !== authHostname) {
        const targetId = await createAuthReturnTarget({
          targetHostname: currentHostname,
          returnPath: returnTo,
        });
        const url = new URL(authSignInUrl());
        url.searchParams.set("returnTarget", targetId);
        return url.toString();
      }
    }
  }

  return auth0LoginPath(returnTo);
}

/** Branded interstitial (connection buttons). Prefer buildSignInUrl for automatic SSO. */
export function signInUrlFor(request: NextRequest): string {
  const login = new URL("/sign-in", request.url);
  login.searchParams.set("returnTo", returnToFromRequest(request));
  return login.pathname + login.search;
}
