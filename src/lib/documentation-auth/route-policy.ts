/** Auth UX paths — always reachable without an app session. */
const PUBLIC_PAGE_PREFIXES = [
  "/auth",
  "/sign-in",
  "/sign-up",
  "/access",
  "/invite",
  "/post-login",
];

/**
 * Anonymous viewer surfaces: browse docs + Ask AI without signing in.
 * Admin/settings/authentication stay Auth0-gated.
 */
const ANONYMOUS_VIEWER_PAGE_PREFIXES = ["/docs", "/guides", "/changelog", "/agent"];

const PUBLIC_API_EXACT = [
  "/api/auth/invite-check",
  "/api/auth/session",
  "/api/auth/me",
  "/api/auth/setup-status",
  "/api/auth/okta-signup",
  "/api/auth/csrf",
  "/api/invites/validate",
  "/api/health/live",
  "/api/health/ready",
  "/api/health/auth",
  "/api/docs/search",
  "/api/products",
  /** Ask AI chat only — nested mutate/deploy routes stay protected. */
  "/api/agent",
];

function matchesExactOrDescendant(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** Product catalog metadata reads (`/api/products/ctix`) — not `/ingest` mutations. */
function isPublicProductMetadataPath(pathname: string): boolean {
  return /^\/api\/products\/[^/]+$/.test(pathname);
}

export function isPublicPagePath(pathname: string): boolean {
  if (isAnonymousViewerPath(pathname)) return true;
  return PUBLIC_PAGE_PREFIXES.some((path) =>
    matchesExactOrDescendant(pathname, path)
  );
}

/**
 * True for anonymous-viewer browsable pages (hub, docs, Ask AI, guides, changelog).
 * Used by the client auth provider so invite failures do not yank users off these routes.
 */
export function isAnonymousViewerPath(pathname: string): boolean {
  if (pathname === "/" || pathname === "") return true;
  return ANONYMOUS_VIEWER_PAGE_PREFIXES.some((path) =>
    matchesExactOrDescendant(pathname, path)
  );
}

/** @deprecated Prefer isAnonymousViewerPath — hub is part of anonymous viewer browsing. */
export function isAnonymousHubPath(pathname: string): boolean {
  return isAnonymousViewerPath(pathname);
}

export function isPublicApiPath(pathname: string): boolean {
  if (PUBLIC_API_EXACT.includes(pathname)) return true;
  if (isPublicProductMetadataPath(pathname)) return true;
  return false;
}

export function isProtectedPath(pathname: string): boolean {
  return !isPublicPagePath(pathname) && !isPublicApiPath(pathname);
}
