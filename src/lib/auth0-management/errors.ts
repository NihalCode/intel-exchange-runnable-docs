import "server-only";

export type Auth0ProvisioningErrorCode =
  | "AUTH0_MANAGEMENT_NOT_CONFIGURED"
  | "AUTH0_MANAGEMENT_UNAVAILABLE"
  | "AUTH0_USER_PROVISIONING_FAILED"
  | "AUTH0_ORGANIZATION_MEMBERSHIP_FAILED"
  | "AUTH0_ORGANIZATION_INVITATION_FAILED";

export class Auth0ProvisioningError extends Error {
  readonly code: Auth0ProvisioningErrorCode;
  readonly detail?: string;

  constructor(code: Auth0ProvisioningErrorCode, detail?: string) {
    super(code);
    this.name = "Auth0ProvisioningError";
    this.code = code;
    this.detail = detail;
  }
}

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
 * Decide which Auth0 `sub` should be stored after a successful login.
 *
 * Invite-only authZ is email-based. Dual login (Auth0 Database password + Okta
 * Enterprise) produces different `sub` values for the same email — always prefer
 * the live session identity so Okta SSO can take over a previously provisioned
 * Database user (and vice versa) instead of failing as "wrong email".
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
  // Same normalized email already exists under another Auth0 identity
  // (e.g. auth0|… from Management provision, oidc|… from Okta).
  if (email.trim()) return liveSub;
  return storedAuth0UserId;
}

export function userFacingProvisioningMessage(
  code: string,
  detail?: string
): { error: string; hint?: string; status: number } {
  switch (code) {
    case "AUTH0_MANAGEMENT_NOT_CONFIGURED":
      return {
        status: 503,
        error: "Direct user provisioning is not configured on this deployment.",
        hint:
          "Set AUTH0_MANAGEMENT_CLIENT_ID, AUTH0_MANAGEMENT_CLIENT_SECRET, and AUTH0_DATABASE_CONNECTION in the server environment.",
      };
    case "AUTH0_MANAGEMENT_UNAVAILABLE":
      return {
        status: 502,
        error: "Auth0 Management API is unavailable.",
        hint:
          "Verify the M2M application credentials, audience, and scopes (create:users, read:users, create:organization_members).",
      };
    case "AUTH0_ORGANIZATION_MEMBERSHIP_FAILED":
      return {
        status: 502,
        error: "The Auth0 user was created but could not be added to your organization.",
        hint: detail,
      };
    case "AUTH0_ORGANIZATION_INVITATION_FAILED":
      return {
        status: 502,
        error: "Auth0 organization invitation could not be sent.",
        hint: detail,
      };
    case "AUTH0_USER_PROVISIONING_FAILED":
      return {
        status: 502,
        error: "User provisioning failed.",
        hint:
          detail ??
          "Auth0 rejected the create-user request. Confirm AUTH0_DATABASE_CONNECTION matches your username-password connection name.",
      };
    case "USER_EMAIL_CONFLICT":
      return {
        status: 409,
        error: "That email is already linked to a different Auth0 account in this workspace.",
      };
    case "CROSS_ORGANIZATION_USER":
      return {
        status: 409,
        error: "User cannot be provisioned into this organization.",
      };
    default:
      return {
        status: 502,
        error: "User provisioning failed.",
        hint: detail,
      };
  }
}
