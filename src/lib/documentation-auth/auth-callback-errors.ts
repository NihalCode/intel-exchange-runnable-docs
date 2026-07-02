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

function inviteDeniedMessage(): AuthCallbackFailure {
  return {
    code: "invite_required",
    message:
      "This documentation workspace is invite-only. Ask an administrator to invite your email before signing in.",
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
        "Sign-in is misconfigured for this deployment. Ask an administrator to verify Auth0 env vars and callback URLs.",
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
      (code === "access_denied" &&
        (message.includes("must be invited") || message.includes("invite_required")))
    ) {
      return inviteDeniedMessage();
    }
    if (code === "invite_check_failed" || message.includes("invite_check_failed")) {
      return {
        code: "auth_config",
        message:
          "Sign-in could not verify workspace access. Ask an administrator to confirm AUTH0_ACTION_SHARED_SECRET and APP_BASE_URL match in Vercel and the Auth0 Post-Login Action secrets.",
      };
    }
    if (code === "access_denied") {
      return {
        code: "auth_denied",
        message: "Sign-in was cancelled or denied.",
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
