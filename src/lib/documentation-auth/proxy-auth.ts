import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getAuth0 } from "@/lib/auth0";
import {
  getMiddlewareAuthUser,
  isMiddlewareAuthEnabled,
} from "@/lib/documentation-auth/middleware-auth";

const PUBLIC_PATHS = [
  "/auth",
  "/sign-in",
  "/access",
  "/invite",
  "/post-login",
];

const PUBLIC_API_EXACT = [
  "/api/auth/invite-check",
  "/api/auth/session",
  "/api/auth/me",
  "/api/invites/validate",
];

const PUBLIC_API_PREFIXES = ["/api/products"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isPublicApiPath(pathname: string): boolean {
  if (PUBLIC_API_EXACT.includes(pathname)) return true;
  return PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

function isProtectedPath(pathname: string): boolean {
  if (pathname === "/") return true;
  if (pathname.startsWith("/docs")) return true;
  if (pathname.startsWith("/agent")) return true;
  if (pathname.startsWith("/developer")) return true;
  if (pathname.startsWith("/settings")) return true;
  if (pathname.startsWith("/api/agent")) return true;
  if (pathname === "/api/run" || pathname.startsWith("/api/run/")) return true;
  if (pathname.startsWith("/api/users")) return true;
  if (pathname.startsWith("/api/admin")) return true;
  if (pathname.startsWith("/api/docs")) return true;
  return false;
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

  // Auth0 SDK owns /auth/* — never intercept (avoids broken OAuth callback).
  if (pathname.startsWith("/auth")) {
    return authResponse;
  }

  if (isPublicPath(pathname)) {
    return mergeAuthHeaders(NextResponse.next(), authResponse);
  }

  const authUser = await getMiddlewareAuthUser(request);

  if (pathname.startsWith("/api/")) {
    if (isPublicApiPath(pathname)) {
      return authResponse;
    }
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return authResponse;
  }

  if (!authUser && isProtectedPath(pathname)) {
    const login = new URL("/sign-in", request.url);
    login.searchParams.set(
      "returnTo",
      pathname + request.nextUrl.search
    );
    return mergeAuthHeaders(NextResponse.redirect(login), authResponse);
  }

  return authResponse;
}
