/**
 * Access-gate → sign-in navigation.
 *
 * Access pages must hard-navigate to `/sign-in?error=…` (not soft `<Link>`).
 * The error query shows the denial message and forces Continue buttons to use
 * `prompt=login` so a leftover Auth0 SSO cookie cannot silently reuse the
 * denied identity. Prefer logout (`accessBrowseHomeAfterLogoutHref`) when the
 * user wants to browse anonymously.
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
