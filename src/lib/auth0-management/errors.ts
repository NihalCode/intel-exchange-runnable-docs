import "server-only";

export {
  auth0UserIdForLoginLink,
  isProvisionalAuth0UserId,
  provisionalAuth0UserIdForEmail,
} from "@/lib/identity/broker-user-id";

/**
 * Local / organization conflict codes surfaced by Add user after Okta provision.
 * Auth0 Management API provisioning codes are obsolete after the Okta cutover.
 */
export type Auth0ProvisioningErrorCode =
  | "USER_EMAIL_CONFLICT"
  | "CROSS_ORGANIZATION_USER";

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

export function userFacingProvisioningMessage(
  code: string,
  detail?: string
): { error: string; hint?: string; status: number } {
  switch (code) {
    case "USER_EMAIL_CONFLICT":
      return {
        status: 409,
        error: "That email is already linked to a different account in this workspace.",
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
