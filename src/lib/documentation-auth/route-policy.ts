/** Auth UX and health endpoints only — the documentation app itself is Auth0-gated. */
const PUBLIC_PAGE_PREFIXES = [
  "/auth",
  "/sign-in",
  "/access",
  "/invite",
  "/post-login",
];

/**
 * Product hub routes that stay readable without an app session (viewer-style
 * landing + Sign in). Docs/agent/admin still require invite-backed login.
 * Host-routed product deployments already skip the edge Auth0 redirect for
 * these; the client auth provider must not yank users to /access/* either.
 */
const ANONYMOUS_HUB_PATHS = new Set(["/", ""]);

const PUBLIC_API_EXACT = [
  "/api/auth/invite-check",
  "/api/auth/session",
  "/api/auth/me",
  "/api/auth/setup-status",
  "/api/invites/validate",
  "/api/health/live",
  "/api/health/ready",
  "/api/health/auth",
];

/** Product catalog metadata remains readable pre-login for invite/setup pages only when needed.
 * With full Auth0 gate, protect product/search APIs as well. */
const PUBLIC_API_PREFIXES: string[] = [];

function matchesExactOrDescendant(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function isPublicPagePath(pathname: string): boolean {
  return PUBLIC_PAGE_PREFIXES.some((path) =>
    matchesExactOrDescendant(pathname, path)
  );
}

/** True for the public product hub — browse without signing in. */
export function isAnonymousHubPath(pathname: string): boolean {
  return ANONYMOUS_HUB_PATHS.has(pathname);
}

export function isPublicApiPath(pathname: string): boolean {
  if (PUBLIC_API_EXACT.includes(pathname)) return true;
  return PUBLIC_API_PREFIXES.some((path) =>
    matchesExactOrDescendant(pathname, path)
  );
}

export function isProtectedPath(pathname: string): boolean {
  return !isPublicPagePath(pathname) && !isPublicApiPath(pathname);
}
