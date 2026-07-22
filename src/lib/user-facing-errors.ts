/** Patterns that indicate internal configuration details — never show raw matches to end users. */
const ENV_VAR_PATTERN =
  /\b(?:[A-Z][A-Z0-9_]{2,}|VERCEL(?:_[A-Z0-9_]+)?)\b/g;

const SET_ENV_INSTRUCTION =
  /set\s+[A-Z][A-Z0-9_]+(?:\s*,\s*[A-Z][A-Z0-9_]+)*\s+in\s+(?:server\s+environment|\.env(?:\.local)?|Vercel)/i;

/**
 * Strip env var names and deployment jargon from a message before showing it in the UI.
 * Falls back to `fallback` when the message is empty or mostly internal configuration text.
 */
export function sanitizeUserFacingMessage(
  message: string | null | undefined,
  fallback: string
): string {
  const trimmed = message?.trim();
  if (!trimmed) return fallback;

  if (ENV_VAR_PATTERN.test(trimmed) || SET_ENV_INSTRUCTION.test(trimmed)) {
    ENV_VAR_PATTERN.lastIndex = 0;
    return fallback;
  }
  ENV_VAR_PATTERN.lastIndex = 0;

  return trimmed;
}

export const ASK_AI_UNAVAILABLE_MESSAGE =
  "Ask AI isn't available right now. Contact your workspace administrator if this continues.";

export const DEVELOPER_ACCESS_UNAVAILABLE_MESSAGE =
  "This action isn't available in this environment. Contact your workspace administrator.";

export const SIGN_IN_NOT_CONFIGURED_MESSAGE =
  "Sign-in isn't set up for this environment. Contact your administrator.";

export const AUTH_SETUP_ADMIN_MESSAGE =
  "Sign-in isn't set up for this environment. An administrator needs to configure authentication before you can sign in.";

export const USERS_UNAVAILABLE_LOCAL_MESSAGE =
  "User management requires a configured sign-in and database. In local preview mode, this list stays empty — that's expected.";

export const USERS_UNAVAILABLE_MESSAGE =
  "We couldn't load the user list right now. Try refreshing the page, or contact your administrator if this continues.";

/** Map API / guard errors to plain-language copy (no env var names). */
export function mapAgentApiError(raw: string | undefined, status?: number): string {
  const msg = raw?.trim() ?? "";
  if (!msg) {
    return status === 503
      ? ASK_AI_UNAVAILABLE_MESSAGE
      : "Something went wrong. Please try again.";
  }
  if (/DEVELOPER_ACCESS_TOKEN|developer access is not configured/i.test(msg)) {
    return ASK_AI_UNAVAILABLE_MESSAGE;
  }
  if (/OPENAI_API_KEY|OPENAI_NOT_CONFIGURED|not configured yet/i.test(msg)) {
    return ASK_AI_UNAVAILABLE_MESSAGE;
  }
  return sanitizeUserFacingMessage(msg, ASK_AI_UNAVAILABLE_MESSAGE);
}

export const SESSION_EXPIRED_USER_MESSAGE =
  "Your session has expired. Redirecting you to sign in…";

/**
 * Classify Ask AI HTTP failures so product/auth 403s are not treated as
 * session expiry, and only explicit SESSION_EXPIRED 401s trigger sign-in redirect.
 */
export function classifyAgentHttpFailure(input: {
  status: number;
  code?: string | null;
  error?: string | { message?: string; code?: string } | null;
}): {
  kind: "session_expired" | "api_error";
  message: string;
  shouldRedirectToSignIn: boolean;
} {
  const code =
    (typeof input.code === "string" && input.code) ||
    (typeof input.error === "object" &&
    input.error &&
    typeof input.error.code === "string"
      ? input.error.code
      : "") ||
    "";

  if (input.status === 401 && code === "SESSION_EXPIRED") {
    return {
      kind: "session_expired",
      message: SESSION_EXPIRED_USER_MESSAGE,
      shouldRedirectToSignIn: true,
    };
  }

  if (input.status === 401 && !code) {
    // Legacy/bare 401 from auth middleware without a machine code.
    return {
      kind: "session_expired",
      message: SESSION_EXPIRED_USER_MESSAGE,
      shouldRedirectToSignIn: true,
    };
  }

  const raw =
    typeof input.error === "string"
      ? input.error
      : typeof input.error === "object" && input.error !== null
        ? input.error.message ?? input.error.code ?? code
        : code || undefined;

  return {
    kind: "api_error",
    message: mapAgentApiError(raw, input.status),
    shouldRedirectToSignIn: false,
  };
}
