import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  buildLoginBridgeResponse,
  cleanupTransactionAfterCallback,
  injectTransactionCookieIfMissing,
  isAuthLoginPath,
  persistTransactionFromAuthResponse,
  withAbsoluteLogoutReturnTo,
} from "@/lib/documentation-auth/oauth-route-handlers";
import {
  authConfigSignInUrl,
  authEnvValidationError,
  getAuthEnv,
} from "@/lib/documentation-auth/env";
import { getAuth0 } from "@/lib/auth0";

export const runtime = "nodejs";

function authConfigRedirect(): NextResponse {
  const message =
    authEnvValidationError() ??
    "Auth0 is not configured for this deployment. Set Auth0 env vars in Vercel.";
  return NextResponse.redirect(authConfigSignInUrl(message));
}

function authFailureRedirect(error: unknown): NextResponse {
  const detail =
    error instanceof Error ? error.message.slice(0, 300) : "Sign-in failed unexpectedly.";
  return NextResponse.redirect(
    authConfigSignInUrl(`Auth login failed: ${detail}`)
  );
}

/**
 * Auth0 OAuth routes run on Node.js so transaction cookies and DB fallback
 * survive the redirect chain to Auth0/Google and back.
 */
async function handleAuth(request: NextRequest): Promise<NextResponse> {
  try {
    const auth0 = getAuth0();
    if (!auth0) {
      return authConfigRedirect();
    }

    const withTxn = await injectTransactionCookieIfMissing(request);
    const appBaseUrl =
      getAuthEnv().appBaseUrl ?? withTxn.nextUrl.origin;
    const req = withAbsoluteLogoutReturnTo(withTxn, appBaseUrl);
    const authResponse = await auth0.middleware(req);

    if (isAuthLoginPath(request.nextUrl.pathname)) {
      const authorizeUrl = authResponse.headers.get("location");
      const isRedirectToAuth0 =
        authResponse.status >= 300 &&
        authResponse.status < 400 &&
        Boolean(
          authorizeUrl &&
            (authorizeUrl.includes("auth0.com") ||
              authorizeUrl.includes("/authorize"))
        );

      if (isRedirectToAuth0 && authorizeUrl) {
        try {
          await persistTransactionFromAuthResponse(authResponse);
        } catch {
          // Cookie on the bridge response is sufficient for most browsers.
        }
        return buildLoginBridgeResponse(authResponse, authorizeUrl);
      }

      // Auth0 SDK returned an error page / unexpected response — surface it.
      if (authResponse.status >= 400) {
        return NextResponse.redirect(
          authConfigSignInUrl(
            `Auth0 login returned HTTP ${authResponse.status}. Check AUTH0_CLIENT_ID/SECRET and APP_BASE_URL.`
          )
        );
      }
    }

    try {
      await cleanupTransactionAfterCallback(request, authResponse);
    } catch {
      // ignore cleanup failures
    }
    return authResponse;
  } catch (error) {
    return authFailureRedirect(error);
  }
}

export async function GET(request: NextRequest) {
  return handleAuth(request);
}

export async function POST(request: NextRequest) {
  return handleAuth(request);
}

export async function DELETE(request: NextRequest) {
  return handleAuth(request);
}
