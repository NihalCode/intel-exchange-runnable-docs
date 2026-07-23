/**
 * Access-gate → sign-in navigation.
 *
 * Bare `/sign-in` auto-forwards to `/auth/login`, which silent-SSOs the same
 * Auth0 session and bounces the user back to the access page. Soft Next.js
 * `<Link>` can also fail after Auth0 redirects. Access pages must hard-navigate
 * to `/sign-in?error=…` so the branded interstitial renders (no auto-forward).
 * Continue then uses `prompt=login` so the denied Auth0 session is not reused.
 *
 * Do not nest this path inside `/auth/logout?returnTo=` — Auth0 Allowed Logout
 * URLs are typically origin-only (same Oops regression as MFA step-up).
 */
export function accessBackToSignInHref(errorCode = "auth_denied"): string {
  const code = errorCode.trim() || "auth_denied";
  return `/sign-in?error=${encodeURIComponent(code)}`;
}

/**
 * Clear the Auth0 session, then land on the public product hub (Sign in in header).
 *
 * Prefer this when the user wants to leave the access gate and browse anonymously.
 * `returnTo=/` is absolutized by the logout route handler.
 */
export function accessBrowseHomeAfterLogoutHref(): string {
  return `/auth/logout?returnTo=${encodeURIComponent("/")}`;
}
