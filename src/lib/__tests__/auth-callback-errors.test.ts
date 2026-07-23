import { describe, expect, it } from "vitest";
import {
  AuthorizationCodeGrantError,
  AuthorizationError,
  InvalidStateError,
  OAuth2Error,
} from "@auth0/nextjs-auth0/errors";

import { mapAuthCallbackError } from "@/lib/documentation-auth/auth-callback-errors";

describe("mapAuthCallbackError", () => {
  it("maps invalid state", () => {
    const mapped = mapAuthCallbackError(new InvalidStateError());
    expect(mapped.code).toBe("invalid_state");
  });

  it("maps invite_required from OAuth2 access_denied", () => {
    const mapped = mapAuthCallbackError(
      new OAuth2Error({
        code: "access_denied",
        message: "You must be invited to access this documentation workspace.",
      })
    );
    expect(mapped.code).toBe("invite_required");
  });

  it("maps wrapped AuthorizationError to actionable copy", () => {
    const mapped = mapAuthCallbackError(
      new AuthorizationError({
        cause: new OAuth2Error({ code: "access_denied", message: "invite_required" }),
      })
    );
    expect(mapped.code).toBe("invite_required");
  });

  it("maps authorization code grant failures", () => {
    const mapped = mapAuthCallbackError(
      new AuthorizationCodeGrantError({
        cause: new OAuth2Error({ code: "invalid_grant", message: "invalid grant" }),
      })
    );
    expect(mapped.code).toBe("auth_failed");
    expect(mapped.message).toMatch(/callback URLs/i);
  });

  it("maps generic AuthorizationError without leaking SDK default", () => {
    const mapped = mapAuthCallbackError(
      new AuthorizationError({
        cause: new OAuth2Error({ code: "server_error", message: "upstream" }),
      })
    );
    expect(mapped.code).toBe("auth_failed");
    expect(mapped.message).not.toBe("An error occurred during the authorization flow.");
  });

  it("maps invite_check_failed to auth_config not invite-only", () => {
    const mapped = mapAuthCallbackError(
      new OAuth2Error({
        code: "access_denied",
        message: "invite_check_failed",
      })
    );
    expect(mapped.code).toBe("auth_config");
    expect(mapped.message).toMatch(/AUTH0_ACTION_SHARED_SECRET/);
  });

  it("maps disabled access_denied", () => {
    const mapped = mapAuthCallbackError(
      new OAuth2Error({
        code: "access_denied",
        message: "disabled",
      })
    );
    expect(mapped.code).toBe("disabled");
  });

  it("maps expired_invite access_denied", () => {
    const mapped = mapAuthCallbackError(
      new OAuth2Error({
        code: "expired_invite",
        message: "Invite expired",
      })
    );
    expect(mapped.code).toBe("expired_invite");
  });

  it("maps password-related access_denied to set_password hint", () => {
    const mapped = mapAuthCallbackError(
      new OAuth2Error({
        code: "access_denied",
        message: "Unable to sign in",
      })
    );
    expect(mapped.code).toBe("set_password");
  });
});
