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
    return mergeAuthHeaders(NextResponse.next(), authResponse);
  }

  const authUser = await getMiddlewareAuthUser(request);

  if (pathname.startsWith("/api/")) {
    if (isPublicApiPath(pathname)) {
      return mergeAuthHeaders(NextResponse.next(), authResponse);
    }
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
