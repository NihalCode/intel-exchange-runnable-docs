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
