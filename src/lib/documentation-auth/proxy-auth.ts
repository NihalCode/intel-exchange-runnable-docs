import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getAuth0 } from "@/lib/auth0";
import {
  isProtectedPath,
  isPublicApiPath,
  isPublicPagePath,
} from "@/lib/documentation-auth/route-policy";
import { applyHostRouting } from "@/lib/domains/proxy-host";
import {
  getMiddlewareAuthUser,
  isMiddlewareAuthEnabled,
} from "@/lib/documentation-auth/middleware-auth";
import { buildSignInUrl } from "@/lib/documentation-auth/sign-in-url";
import {
  auth0StepUpLoginPath,
  MFA_STEP_UP_COOKIE,
  MFA_STEP_UP_START_PATH,
} from "@/lib/enterprise/mfa-step-up";
import {
  FRESH_LOGIN_COOKIE,
  FRESH_LOGIN_START_PATH,
  clearFreshLoginCookieOptions,
  freshPasswordLoginPath,
} from "@/lib/documentation-auth/fresh-login";
import { getAuthCookieDomain } from "@/lib/auth0-management/invite-provision";

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

export { signInUrlFor } from "@/lib/documentation-auth/sign-in-url";

/**
 * 401 for protected API routes. Crucially this MERGES the Auth0 rolling-session
 * cookies from the middleware response so a refreshed/rotated session cookie
 * still reaches the client (allowing an immediate retry to succeed) and returns
 * an actionable, machine-readable body instead of a bare "Unauthorized" so the
 * client can redirect the user to sign in.
 */
export async function unauthorizedApiResponse(
  request: NextRequest,
  authResponse: NextResponse
): Promise<NextResponse> {
  const signIn = await buildSignInUrl(request);
  const response = NextResponse.json(
    {
      error: "Session expired — sign in again",
      code: "SESSION_EXPIRED",
      signIn,
    },
    { status: 401 }
  );
  return mergeAuthHeaders(response, authResponse);
}

async function authUnavailableResponse(
  request: NextRequest,
  code: string
): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        error: "Authentication service unavailable",
        code,
      },
      { status: 503 }
    );
  }
  if (isPublicPagePath(pathname)) {
    return NextResponse.next();
  }
  const signIn = await buildSignInUrl(request);
  const destination = signIn.startsWith("http")
    ? signIn
    : new URL(signIn, request.url).toString();
  const url = new URL(destination);
  url.searchParams.set("error", "auth_config");
  url.searchParams.set("message", `Authentication unavailable (${code}).`);
  return NextResponse.redirect(url);
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
  try {
    return await runDocumentationAuthProxyInner(request);
  } catch {
    // Unexpected proxy failure: fail closed on protected routes.
    if (
      isProtectedPath(request.nextUrl.pathname) &&
      !isPublicPagePath(request.nextUrl.pathname) &&
      !isPublicApiPath(request.nextUrl.pathname)
    ) {
      return authUnavailableResponse(request, "AUTH_MIDDLEWARE_FAILED");
    }
    return NextResponse.next();
  }
}

async function runDocumentationAuthProxyInner(
  request: NextRequest
): Promise<NextResponse> {
  if (!isMiddlewareAuthEnabled()) {
    return NextResponse.next();
  }

  const auth0 = getAuth0();
  if (!auth0) {
    if (isPublicPagePath(request.nextUrl.pathname) || isPublicApiPath(request.nextUrl.pathname)) {
      return NextResponse.next();
    }
    return authUnavailableResponse(request, "AUTH_ENV_INCOMPLETE");
  }

  let authResponse: NextResponse;
  try {
    authResponse = await auth0.middleware(request);
  } catch {
    if (isPublicPagePath(request.nextUrl.pathname) || isPublicApiPath(request.nextUrl.pathname)) {
      return NextResponse.next();
    }
    return authUnavailableResponse(request, "AUTH_MIDDLEWARE_FAILED");
  }

  const { pathname } = request.nextUrl;

  // Cookie bridges must run BEFORE host routing. On single-product hosts
  // (e.g. apitest1) applyHostRouting always returns a response and would
  // otherwise swallow these and leave the user on `/`.
  const pendingMfaReturnTo = request.cookies.get(MFA_STEP_UP_COOKIE)?.value;
  if (
    pendingMfaReturnTo &&
    !pathname.startsWith("/auth/") &&
    pathname !== MFA_STEP_UP_START_PATH &&
    !pathname.startsWith(`${MFA_STEP_UP_START_PATH}/`)
  ) {
    const safePath =
      pendingMfaReturnTo.startsWith("/") && !pendingMfaReturnTo.startsWith("//")
        ? pendingMfaReturnTo
        : "/admin";
    const destination = new URL(auth0StepUpLoginPath(safePath), request.url);
    const response = NextResponse.redirect(destination);
    response.cookies.set(MFA_STEP_UP_COOKIE, "", {
      httpOnly: true,
      path: "/",
      maxAge: 0,
    });
    return mergeAuthHeaders(response, authResponse);
  }

  const pendingFreshLogin = request.cookies.get(FRESH_LOGIN_COOKIE)?.value;
  if (
    pendingFreshLogin &&
    !pathname.startsWith("/auth/") &&
    pathname !== FRESH_LOGIN_START_PATH &&
    !pathname.startsWith(`${FRESH_LOGIN_START_PATH}/`)
  ) {
    const destination = new URL(freshPasswordLoginPath(pendingFreshLogin), request.url);
    const response = NextResponse.redirect(destination);
    response.cookies.set(
      FRESH_LOGIN_COOKIE,
      "",
      clearFreshLoginCookieOptions(getAuthCookieDomain())
    );
    return mergeAuthHeaders(response, authResponse);
  }

  const hostRouted = await applyHostRouting(request, authResponse);
  if (hostRouted) return hostRouted;

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
      return await unauthorizedApiResponse(request, authResponse);
    }
    return continueWithAuthHeaders(request, authResponse);
  }

  if (!authUser && isProtectedPath(pathname)) {
    const signIn = await buildSignInUrl(request);
    const destination = signIn.startsWith("http") ? signIn : new URL(signIn, request.url).toString();
    return mergeAuthHeaders(NextResponse.redirect(destination), authResponse);
  }

  return continueWithAuthHeaders(request, authResponse);
}
