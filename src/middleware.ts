import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  getMiddlewareAuthUser,
  isMiddlewareAuthEnabled,
} from "@/lib/documentation-auth/middleware-auth";
import { getAuth0 } from "@/lib/auth0";

const PUBLIC_PATHS = [
  "/auth",
  "/sign-in",
  "/access",
  "/invite",
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

export async function middleware(request: NextRequest) {
  if (!isMiddlewareAuthEnabled()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  const auth0 = getAuth0();

  if (!isProtectedPath(pathname) && !pathname.startsWith("/api/")) {
    if (isPublicPath(pathname)) {
      return auth0 ? auth0.middleware(request) : NextResponse.next();
    }
    return auth0 ? auth0.middleware(request) : NextResponse.next();
  }

  const authResponse = auth0 ? await auth0.middleware(request) : NextResponse.next();
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
    login.searchParams.set("returnTo", pathname);
    return NextResponse.redirect(login);
  }

  return authResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:png|svg|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
