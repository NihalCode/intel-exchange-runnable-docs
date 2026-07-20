import type { AppSession } from "@/lib/documentation-auth/session";

export interface AuthAssuranceResult {
  ok: boolean;
  reason?: "mfa_required" | "recent_auth_required";
}

export function hasPrivilegedMfa(session: AppSession): boolean {
  if (session.authProvider !== "auth0") return true;
  const methods = session.claims?.amr?.map((value) => value.toLowerCase()) ?? [];
  const acr = session.claims?.acr?.toLowerCase() ?? "";
  return (
    methods.some((method) => ["mfa", "otp", "webauthn", "hwk"].includes(method)) ||
    acr.includes("mfa") ||
    acr.includes("multi-factor")
  );
}

export function hasRecentAuthentication(
  session: AppSession,
  maxAgeSeconds = 10 * 60,
  nowSeconds = Math.floor(Date.now() / 1000)
): boolean {
  if (session.authProvider !== "auth0") return true;
  const authTime = session.claims?.authTime;
  // Missing claim used to fail closed and block owners right after login when
  // Auth0 omitted auth_time. Prefer fail-open for age when claim is absent;
  // MFA (when required) still gates privileged actions separately.
  if (typeof authTime !== "number") return true;
  const age = nowSeconds - authTime;
  return age >= -60 && age <= maxAgeSeconds;
}

export function checkStepUpAuthentication(
  session: AppSession,
  options: { requireMfa?: boolean; maxAuthAgeSeconds?: number } = {}
): AuthAssuranceResult {
  if (options.requireMfa && !hasPrivilegedMfa(session)) {
    return { ok: false, reason: "mfa_required" };
  }
  if (
    options.maxAuthAgeSeconds != null &&
    !hasRecentAuthentication(session, options.maxAuthAgeSeconds)
  ) {
    return { ok: false, reason: "recent_auth_required" };
  }
  return { ok: true };
}
