import type { AppSession } from "@/lib/documentation-auth/session";
import { getRequiredOktaConnection } from "@/lib/documentation-auth/password-connection";

/** Short-lived cookie bridging Auth0 logout → forced re-auth via Okta Verify. */
export const MFA_STEP_UP_COOKIE = "cyware_mfa_step_up";

/** Starts MFA step-up: set cookie, then Auth0 logout to the allowlisted app origin. */
export const MFA_STEP_UP_START_PATH = "/access/mfa-step-up";

const MFA_STEP_UP_COOKIE_MAX_AGE_SEC = 180;

function safeAppPath(returnTo: string, fallback: string): string {
  return returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : fallback;
}

/**
 * Forces a fresh Auth0 login through the Okta Workforce connection (Okta Verify),
 * then return to `returnTo`. Query params are forwarded by @auth0/nextjs-auth0 v4.
 * Never uses Auth0 Guardian / ACR multi-factor.
 */
export function auth0StepUpLoginPath(returnTo = "/admin"): string {
  const path = safeAppPath(returnTo, "/admin");
  const params = new URLSearchParams({
    returnTo: path,
    prompt: "login",
    max_age: "0",
    connection: getRequiredOktaConnection(),
  });
  return `/auth/login?${params.toString()}`;
}

/**
 * App entry for “Sign out and complete MFA”.
 *
 * Must NOT nest `/auth/login?...` inside `/auth/logout?returnTo=` — Auth0's
 * logout endpoint rejects relative returnTo values and paths that are not on
 * Allowed Logout URLs, which surfaces as the tenant “Oops!, something went wrong”
 * page. Instead we start at an app route that sets a cookie and logs out to the
 * exact allowlisted origin only.
 */
export function adminMfaStepUpHref(returnTo = "/admin"): string {
  const path = safeAppPath(returnTo, "/admin");
  return `${MFA_STEP_UP_START_PATH}?returnTo=${encodeURIComponent(path)}`;
}

/** Absolute origin for Auth0 `returnTo` / `post_logout_redirect_uri` (no path). */
export function normalizeLogoutOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "");
}

/**
 * Logout URL whose Auth0 returnTo is exactly the app origin — matches the
 * usual Allowed Logout URLs entry (`https://host`) without needing `/auth/login`
 * (or any other path) on the allowlist.
 */
export function auth0LogoutToOriginPath(appOrigin: string): string {
  const origin = normalizeLogoutOrigin(appOrigin);
  return `/auth/logout?returnTo=${encodeURIComponent(origin)}`;
}

export function mfaStepUpCookieOptions(secure: boolean) {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    path: "/",
    secure,
    maxAge: MFA_STEP_UP_COOKIE_MAX_AGE_SEC,
  };
}

/** Human-readable session MFA summary for admin denial UI. */
export function describeSessionMfa(session: AppSession | null | undefined): string[] {
  const methods = session?.claims?.amr ?? [];
  const acr = session?.claims?.acr;
  const lines: string[] = [];
  if (methods.length) lines.push(`Current session methods: ${methods.join(", ")}.`);
  if (acr) lines.push(`ACR: ${acr}.`);
  if (!lines.length) {
    lines.push("This session did not include MFA claims (amr/acr) from Auth0.");
  }
  return lines;
}
