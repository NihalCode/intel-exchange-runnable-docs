const PUBLIC_PAGE_EXACT = ["/"];
const PUBLIC_PAGE_PREFIXES = [
  "/docs",
  "/guides",
  "/changelog",
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
  "/api/health/live",
  "/api/health/ready",
  "/api/docs/search",
];

const PUBLIC_API_PREFIXES = ["/api/products"];

function matchesExactOrDescendant(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function isPublicPagePath(pathname: string): boolean {
  if (PUBLIC_PAGE_EXACT.includes(pathname)) return true;
  return PUBLIC_PAGE_PREFIXES.some((path) =>
    matchesExactOrDescendant(pathname, path)
  );
}

export function isPublicApiPath(pathname: string): boolean {
  if (PUBLIC_API_EXACT.includes(pathname)) return true;
  return PUBLIC_API_PREFIXES.some((path) => pathname.startsWith(path));
}

export function isProtectedPath(pathname: string): boolean {
  return !isPublicPagePath(pathname) && !isPublicApiPath(pathname);
}
