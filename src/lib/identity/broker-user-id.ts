import "server-only";

/**
 * Provisional local `auth0_user_id` before the user completes Auth0-brokered Okta login.
 * Replaced with the live Auth0 `sub` on first successful sign-in.
 */
export function isProvisionalAuth0UserId(auth0UserId: string): boolean {
  return auth0UserId.startsWith("auth0|invited|");
}

export function provisionalAuth0UserIdForEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }
  return `auth0|invited|${hash.toString(16)}`;
}

/**
 * Decide which Auth0 broker `sub` should be stored after a successful login.
 *
 * Invite-only authZ is email-based. Prefer the live session identity so a
 * federated Okta sub can replace a provisional invite id (or a legacy Database
 * `auth0|…` row for the same verified email).
 */
export function auth0UserIdForLoginLink(
  storedAuth0UserId: string,
  email: string,
  liveSub: string
): string {
  if (!liveSub) return storedAuth0UserId;
  if (storedAuth0UserId === liveSub) return liveSub;
  if (isProvisionalAuth0UserId(storedAuth0UserId)) {
    const expected = provisionalAuth0UserIdForEmail(email);
    if (storedAuth0UserId === expected) return liveSub;
    return storedAuth0UserId;
  }
  if (email.trim()) return liveSub;
  return storedAuth0UserId;
}
