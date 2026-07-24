import "server-only";

export type OktaProvisioningErrorCode =
  | "OKTA_NOT_CONFIGURED"
  | "OKTA_UNAVAILABLE"
  | "OKTA_USER_PROVISIONING_FAILED"
  | "OKTA_APP_ASSIGNMENT_FAILED"
  | "OKTA_GROUP_ASSIGNMENT_FAILED"
  | "OKTA_ACTIVATION_FAILED";

export class OktaProvisioningError extends Error {
  readonly code: OktaProvisioningErrorCode;
  readonly detail?: string;

  constructor(code: OktaProvisioningErrorCode, detail?: string) {
    super(code);
    this.name = "OktaProvisioningError";
    this.code = code;
    this.detail = detail;
  }
}

export function userFacingOktaProvisioningMessage(
  code: string,
  detail?: string
): { error: string; hint?: string; status: number } {
  switch (code) {
    case "OKTA_NOT_CONFIGURED":
      return {
        status: 503,
        error: "Okta user provisioning is not configured on this deployment.",
        hint:
          "Set OKTA_ORG_URL, OKTA_API_TOKEN, and OKTA_DOCS_GROUP_ID (Cyware Docs Users, 00g…) so Add user can create people in Okta.",
      };
    case "OKTA_UNAVAILABLE":
      return {
        status: 502,
        error: "Okta API is unavailable.",
        hint: detail ?? "Verify OKTA_ORG_URL and OKTA_API_TOKEN (ssws token with users/groups/apps scopes).",
      };
    case "OKTA_APP_ASSIGNMENT_FAILED":
      return {
        status: 502,
        error: "The Okta user was created but could not be assigned to the docs app.",
        hint:
          detail ??
          "If this app uses Federation Broker Mode, set OKTA_DOCS_GROUP_ID to the Cyware Docs Users group id and retry.",
      };
    case "OKTA_GROUP_ASSIGNMENT_FAILED":
      return {
        status: 502,
        error: "The Okta user was created but could not be added to the docs group.",
        hint: detail,
      };
    case "OKTA_ACTIVATION_FAILED":
      return {
        status: 502,
        error: "Okta could not send the password setup email.",
        hint: detail,
      };
    case "OKTA_USER_PROVISIONING_FAILED":
      return {
        status: 502,
        error: "Okta user provisioning failed.",
        hint: detail,
      };
    default:
      return {
        status: 502,
        error: "Okta user provisioning failed.",
        hint: detail,
      };
  }
}
