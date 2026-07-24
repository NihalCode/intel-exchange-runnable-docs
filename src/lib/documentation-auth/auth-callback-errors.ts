import {
  AuthorizationCodeGrantError,
  AuthorizationError,
  InvalidConfigurationError,
  InvalidStateError,
  MissingStateError,
  OAuth2Error,
} from "@auth0/nextjs-auth0/errors";

export interface AuthCallbackFailure {
  code: string;
  message: string;
}

function hasCause(error: unknown): error is { cause?: unknown } {
  return typeof error === "object" && error !== null && "cause" in error;
}

function unwrapOAuth2(error: unknown): OAuth2Error | null {
  if (error instanceof OAuth2Error) return error;
  if (hasCause(error) && error.cause) {
    return unwrapOAuth2(error.cause);
  }
  return null;
}

function inviteDeniedMessage(code = "invite_required"): AuthCallbackFailure {
  return {
    code,
    message:
      code === "expired_invite"
        ? "Your invite has expired. Ask an administrator to send a new invite before signing in."
        : "This documentation workspace is invite-only. Ask an administrator to invite your email before signing in.",
  };
}

function disabledMessage(): AuthCallbackFailure {
  return {
    code: "disabled",
    message: "Your account has been disabled. Contact a workspace administrator for access.",
  };
}

/** Map Auth0 SDK callback errors to sign-in page codes and plain-English copy. */
export function mapAuthCallbackError(error: unknown): AuthCallbackFailure {
  if (error instanceof InvalidStateError || error instanceof MissingStateError) {
    return {
      code: "invalid_state",
      message:
        "Sign-in could not be verified. Click Continue below and finish login in this same browser tab.",
    };
  }

  if (error instanceof InvalidConfigurationError) {
    return {
      code: "auth_config",
      message:
        "Sign-in isn't set up for this environment. Contact your administrator.",
    };
  }

  if (error instanceof AuthorizationCodeGrantError) {
    return {
      code: "auth_failed",
      message:
        "Auth0 rejected the login code. Confirm callback URLs and client credentials match this site, then try again.",
    };
  }

  const oauth = unwrapOAuth2(error);
  if (oauth) {
    const code = oauth.code?.toLowerCase() ?? "";
    const message = (oauth.message ?? "").toLowerCase();
    if (
      code === "invite_required" ||
      code === "not_invited" ||
      (code === "access_denied" &&
        (message.includes("must be invited") || message.includes("invite_required")))
    ) {
      return inviteDeniedMessage();
    }
    if (code === "expired_invite" || message.includes("expired_invite")) {
      return inviteDeniedMessage("expired_invite");
    }
    if (code === "disabled" || message === "disabled" || message.includes("account has been disabled")) {
      return disabledMessage();
    }
    if (code === "wrong_email" || message.includes("wrong email")) {
      return {
        code: "wrong_email",
        message:
          "You signed in with a different email than the one that was invited. Use the invited email address.",
      };
    }
    if (code === "invite_check_failed" || message.includes("invite_check_failed")) {
      return {
        code: "auth_config",
        message:
          "Sign-in could not verify workspace access. Ask an administrator to confirm AUTH0_ACTION_SHARED_SECRET and APP_BASE_URL match in Vercel and the Auth0 Post-Login Action secrets.",
      };
    }
    if (code === "access_denied") {
      // First-time Okta users who have not set a password often abort or fail here.
      // Okta also surfaces E0000004 ("Authentication failed") for STAGED/PROVISIONED users.
      if (
        message.includes("password") ||
        message.includes("locked") ||
        message.includes("unable to sign in") ||
        message.includes("user is not assigned") ||
        message.includes("authentication failed") ||
        message.includes("e0000004")
      ) {
        return {
          code: "set_password",
          message:
            "You need to set a password first. Use Sign up, then return here to Sign in.",
        };
      }
      return {
        code: "auth_denied",
        message: "Sign-in was cancelled or denied. If you have not set a password yet, use Sign up first.",
      };
    }
    if (
      code === "invalid_user_password" ||
      code === "password_leaked" ||
      message.includes("wrong email or password") ||
      message.includes("incorrect username or password") ||
      message.includes("authentication failed") ||
      message.includes("e0000004")
    ) {
      return {
        code: "set_password",
        message:
          "Sign-in failed. If this is your first time, use Sign up to set a password, then try Sign in again.",
      };
    }
  }

  if (error instanceof AuthorizationError) {
    const text = `${error.message ?? ""}`.toLowerCase();
    if (text.includes("must be invited") || text.includes("invite_required")) {
      return inviteDeniedMessage();
    }
    return {
      code: "auth_failed",
      message:
        "Sign-in could not be completed. Use one browser tab, clear stale cookies for this site, and try again. If it persists, verify Auth0 callback URLs match this deployment.",
    };
  }

  if (error instanceof Error && error.message.trim()) {
    const text = error.message.toLowerCase();
    if (text.includes("must be invited") || text.includes("invite_required")) {
      return inviteDeniedMessage();
    }
    return { code: "auth_failed", message: error.message };
  }

  return {
    code: "auth_failed",
    message: "Sign-in could not be completed. Please try again.",
  };
}
