/**
 * Access-gate → sign-in navigation.
 *
 * Bare `/sign-in` auto-forwards to `/auth/login`, which silent-SSOs the same
 * Auth0 session and bounces the user back to the access page. Soft Next.js
 * `<Link>` can also fail after Auth0 redirects. Access pages must hard-navigate
 * to `/sign-in?error=…` so the branded interstitial renders (no auto-forward).
 */
export function accessBackToSignInHref(errorCode = "auth_denied"): string {
  const code = errorCode.trim() || "auth_denied";
  return `/sign-in?error=${encodeURIComponent(code)}`;
}
