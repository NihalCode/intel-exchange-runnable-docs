import "server-only";

export type RecaptchaAction =
  | "ask_ai_submit"
  | "feedback_submit"
  | "public_invite";

export interface RecaptchaVerifyResult {
  ok: boolean;
  score: number | null;
  action: string | null;
  hostname: string | null;
  errorCodes: string[];
  degraded: boolean;
  reason?: string;
}

export interface RecaptchaHealthStatus {
  configured: boolean;
  siteKeyPresent: boolean;
  secretPresent: boolean;
  minScore: number;
  allowedHostnames: string[];
  allowedActions: RecaptchaAction[];
}

const DEFAULT_MIN_SCORE = 0.5;
const VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

export function getRecaptchaSiteKey(): string | null {
  const key = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY?.trim()
    || process.env.RECAPTCHA_SITE_KEY?.trim();
  return key || null;
}

export function getRecaptchaSecret(): string | null {
  const secret = process.env.RECAPTCHA_SECRET_KEY?.trim();
  return secret || null;
}

export function getRecaptchaMinScore(): number {
  const raw = process.env.RECAPTCHA_MIN_SCORE?.trim();
  if (!raw) return DEFAULT_MIN_SCORE;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) return DEFAULT_MIN_SCORE;
  return n;
}

export function getRecaptchaAllowedHostnames(): string[] {
  const raw = process.env.RECAPTCHA_ALLOWED_HOSTNAMES?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

export function getRecaptchaHealthStatus(): RecaptchaHealthStatus {
  return {
    configured: Boolean(getRecaptchaSiteKey() && getRecaptchaSecret()),
    siteKeyPresent: Boolean(getRecaptchaSiteKey()),
    secretPresent: Boolean(getRecaptchaSecret()),
    minScore: getRecaptchaMinScore(),
    allowedHostnames: getRecaptchaAllowedHostnames(),
    allowedActions: ["ask_ai_submit", "feedback_submit", "public_invite"],
  };
}

/**
 * Verify a Google reCAPTCHA v3 token.
 * - Authenticated Ask AI / feedback: callers may fail-soft on provider outage.
 * - Public invite forms: callers must fail-closed when ok=false.
 */
export async function verifyRecaptchaToken(input: {
  token: string | null | undefined;
  expectedAction: RecaptchaAction;
  remoteIp?: string | null;
  /** When true, missing/invalid config or network errors return degraded ok=true */
  failSoft?: boolean;
}): Promise<RecaptchaVerifyResult> {
  const secret = getRecaptchaSecret();
  const token = input.token?.trim();

  if (!secret) {
    if (input.failSoft) {
      return {
        ok: true,
        score: null,
        action: input.expectedAction,
        hostname: null,
        errorCodes: ["missing-secret"],
        degraded: true,
        reason: "recaptcha_not_configured",
      };
    }
    return {
      ok: false,
      score: null,
      action: null,
      hostname: null,
      errorCodes: ["missing-secret"],
      degraded: false,
      reason: "recaptcha_not_configured",
    };
  }

  if (!token) {
    if (input.failSoft) {
      return {
        ok: true,
        score: null,
        action: input.expectedAction,
        hostname: null,
        errorCodes: ["missing-input-response"],
        degraded: true,
        reason: "missing_token",
      };
    }
    return {
      ok: false,
      score: null,
      action: null,
      hostname: null,
      errorCodes: ["missing-input-response"],
      degraded: false,
      reason: "missing_token",
    };
  }

  try {
    const body = new URLSearchParams();
    body.set("secret", secret);
    body.set("response", token);
    if (input.remoteIp) body.set("remoteip", input.remoteIp);

    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      if (input.failSoft) {
        return {
          ok: true,
          score: null,
          action: input.expectedAction,
          hostname: null,
          errorCodes: [`http-${response.status}`],
          degraded: true,
          reason: "provider_http_error",
        };
      }
      return {
        ok: false,
        score: null,
        action: null,
        hostname: null,
        errorCodes: [`http-${response.status}`],
        degraded: false,
        reason: "provider_http_error",
      };
    }

    const data = (await response.json()) as {
      success?: boolean;
      score?: number;
      action?: string;
      hostname?: string;
      "error-codes"?: string[];
    };

    const score = typeof data.score === "number" ? data.score : null;
    const action = typeof data.action === "string" ? data.action : null;
    const hostname = typeof data.hostname === "string" ? data.hostname : null;
    const errorCodes = Array.isArray(data["error-codes"])
      ? data["error-codes"]
      : [];

    if (!data.success) {
      return {
        ok: false,
        score,
        action,
        hostname,
        errorCodes,
        degraded: false,
        reason: "verification_failed",
      };
    }

    if (action && action !== input.expectedAction) {
      return {
        ok: false,
        score,
        action,
        hostname,
        errorCodes: [...errorCodes, "action-mismatch"],
        degraded: false,
        reason: "action_mismatch",
      };
    }

    const minScore = getRecaptchaMinScore();
    if (score != null && score < minScore) {
      return {
        ok: false,
        score,
        action,
        hostname,
        errorCodes: [...errorCodes, "score-too-low"],
        degraded: false,
        reason: "score_too_low",
      };
    }

    const allowed = getRecaptchaAllowedHostnames();
    if (allowed.length > 0 && hostname && !allowed.includes(hostname.toLowerCase())) {
      return {
        ok: false,
        score,
        action,
        hostname,
        errorCodes: [...errorCodes, "hostname-mismatch"],
        degraded: false,
        reason: "hostname_mismatch",
      };
    }

    return {
      ok: true,
      score,
      action,
      hostname,
      errorCodes,
      degraded: false,
    };
  } catch (error) {
    if (input.failSoft) {
      return {
        ok: true,
        score: null,
        action: input.expectedAction,
        hostname: null,
        errorCodes: ["network-error"],
        degraded: true,
        reason: error instanceof Error ? error.message : "network_error",
      };
    }
    return {
      ok: false,
      score: null,
      action: null,
      hostname: null,
      errorCodes: ["network-error"],
      degraded: false,
      reason: error instanceof Error ? error.message : "network_error",
    };
  }
}
