import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getAuth0 } from "@/lib/auth0";
import {
  isProtectedPath,
  isPublicApiPath,
  isPublicPagePath,
} from "@/lib/documentation-auth/route-policy";
import {
  getMiddlewareAuthUser,
  isMiddlewareAuthEnabled,
} from "@/lib/documentation-auth/middleware-auth";

export function isPublicDocumentationApiPath(pathname: string): boolean {
  return isPublicApiPath(pathname);
}

export function isProtectedDocumentationPath(pathname: string): boolean {
  return isProtectedPath(pathname);
}

/** Preserve Auth0 session / transaction cookies on custom responses. */
export function mergeAuthHeaders(
  response: NextResponse,
  authResponse: NextResponse
): NextResponse {
  authResponse.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === "x-middleware-next") return;
    response.headers.set(key, value);
  });
  return response;
}

function isRedirectResponse(response: NextResponse): boolean {
  return response.status >= 300 && response.status < 400;
}

/**
 * Build the sign-in URL for a request that was blocked by the auth gate.
 * For API requests we prefer the referring page (the human-visible route the
 * user is actually on) so the post-login redirect lands somewhere useful
 * rather than on a JSON API path.
 */
export function signInUrlFor(request: NextRequest): string {
  const referer = request.headers.get("referer");
  let returnTo = request.nextUrl.pathname + request.nextUrl.search;
  if (referer) {
    try {
      const refUrl = new URL(referer);
      if (refUrl.origin === request.nextUrl.origin) {
        returnTo = refUrl.pathname + refUrl.search;
      }
    } catch {
      // Ignore malformed Referer headers and fall back to the request path.
    }
  }
  const login = new URL("/sign-in", request.url);
  login.searchParams.set("returnTo", returnTo);
  return login.pathname + login.search;
}

/**
 * 401 for protected API routes. Crucially this MERGES the Auth0 rolling-session
 * cookies from the middleware response so a refreshed/rotated session cookie
 * still reaches the client (allowing an immediate retry to succeed) and returns
 * an actionable, machine-readable body instead of a bare "Unauthorized" so the
 * client can redirect the user to sign in.
 */
export function unauthorizedApiResponse(
  request: NextRequest,
  authResponse: NextResponse
): NextResponse {
  const response = NextResponse.json(
    {
      error: "Session expired — sign in again",
      code: "SESSION_EXPIRED",
      signIn: signInUrlFor(request),
    },
    { status: 401 }
  );
  return mergeAuthHeaders(response, authResponse);
}

/** Continue the request while applying Auth0 rolling-session cookies to the response. */
export function continueWithAuthHeaders(
  request: NextRequest,
  authResponse: NextResponse
): NextResponse {
  if (isRedirectResponse(authResponse)) {
    return authResponse;
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(
    "x-pathname",
    request.nextUrl.pathname + request.nextUrl.search
  );

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  return mergeAuthHeaders(response, authResponse);
}

export async function runDocumentationAuthProxy(
  request: NextRequest
): Promise<NextResponse> {
  if (!isMiddlewareAuthEnabled()) {
    return NextResponse.next();
  }

  const auth0 = getAuth0();
  if (!auth0) {
    return NextResponse.next();
  }

  const authResponse = await auth0.middleware(request);
  const { pathname } = request.nextUrl;

  if (isPublicPagePath(pathname)) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(
      "x-pathname",
      request.nextUrl.pathname + request.nextUrl.search
    );
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    return mergeAuthHeaders(response, authResponse);
  }

  const authUser = await getMiddlewareAuthUser(request);

  if (pathname.startsWith("/api/")) {
    if (isPublicApiPath(pathname)) {
      return mergeAuthHeaders(NextResponse.next(), authResponse);
    }
    if (!authUser) {
      return unauthorizedApiResponse(request, authResponse);
    }
    return continueWithAuthHeaders(request, authResponse);
  }

  if (!authUser && isProtectedPath(pathname)) {
    const login = new URL("/sign-in", request.url);
    login.searchParams.set(
      "returnTo",
      pathname + request.nextUrl.search
    );
    return mergeAuthHeaders(NextResponse.redirect(login), authResponse);
  }

  return continueWithAuthHeaders(request, authResponse);
}
