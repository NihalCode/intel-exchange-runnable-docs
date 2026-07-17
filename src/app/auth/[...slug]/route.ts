import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  buildLoginBridgeResponse,
  cleanupTransactionAfterCallback,
  injectTransactionCookieIfMissing,
  isAuthLoginPath,
  persistTransactionFromAuthResponse,
} from "@/lib/documentation-auth/oauth-route-handlers";
import {
  authConfigSignInUrl,
  authEnvValidationError,
} from "@/lib/documentation-auth/env";
import { getAuth0 } from "@/lib/auth0";

export const runtime = "nodejs";

function authConfigRedirect(): NextResponse {
  const message =
    authEnvValidationError() ??
    "Auth0 is not configured for this deployment. Set Auth0 env vars in Vercel.";
  return NextResponse.redirect(authConfigSignInUrl(message));
}

/**
 * Auth0 OAuth routes run on Node.js so transaction cookies and DB fallback
 * survive the redirect chain to Auth0/Google and back.
 */
async function handleAuth(request: NextRequest): Promise<NextResponse> {
  const auth0 = getAuth0();
  if (!auth0) {
    return authConfigRedirect();
  }

  const req = await injectTransactionCookieIfMissing(request);
  const authResponse = await auth0.middleware(req);

  if (isAuthLoginPath(request.nextUrl.pathname)) {
    const authorizeUrl = authResponse.headers.get("location");
    const isRedirectToAuth0 =
      authResponse.status >= 300 &&
      authResponse.status < 400 &&
      Boolean(authorizeUrl?.includes("auth0.com"));

    if (isRedirectToAuth0 && authorizeUrl) {
      await persistTransactionFromAuthResponse(authResponse);
      return buildLoginBridgeResponse(authResponse, authorizeUrl);
    }
  }

  await cleanupTransactionAfterCallback(request, authResponse);
  return authResponse;
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
