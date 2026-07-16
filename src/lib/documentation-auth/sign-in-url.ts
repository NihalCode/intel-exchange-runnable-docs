import type { NextRequest } from "next/server";

import { createAuthReturnTarget } from "@/lib/documentation-auth/auth-return-target";
import { getStaticDomainConfig } from "@/lib/domains/env-config";
import { isCrossDomainSsoEnabled } from "@/lib/domains/feature-gates";
import { normalizeHostname } from "@/lib/domains/normalize";
import { trustedRequestHostname } from "@/lib/domains/request-host";
import { authSignInUrl } from "@/lib/domains/urls";

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
  return returnTo;
}

/**
 * Builds a sign-in URL for the current request. When cross-domain SSO is enabled
 * and AUTH_DOMAIN is configured, stores a short-lived return target and sends
 * the user to the central auth origin.
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
      const currentHostname = normalizedCurrent.ok ? normalizedCurrent.hostname : currentHost.toLowerCase();

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

  const login = new URL("/sign-in", request.url);
  login.searchParams.set("returnTo", returnTo);
  return login.pathname + login.search;
}

/** @deprecated Use buildSignInUrl for cross-domain SSO support. */
export function signInUrlFor(request: NextRequest): string {
  const login = new URL("/sign-in", request.url);
  login.searchParams.set("returnTo", returnToFromRequest(request));
  return login.pathname + login.search;
}
