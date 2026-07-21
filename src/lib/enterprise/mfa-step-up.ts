import type { AppSession } from "@/lib/documentation-auth/session";

/** Auth0 Universal Login MFA ACR (PAPE multi-factor policy). */
export const MFA_ACR_VALUES =
  "http://schemas.openid.net/pape/policies/2007/06/multi-factor";

/**
 * Forces a fresh Auth0 login that should complete MFA, then return to `returnTo`.
 * Query params are forwarded by @auth0/nextjs-auth0 v4 to /authorize.
 */
export function auth0StepUpLoginPath(returnTo = "/admin"): string {
  const path = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/admin";
  const params = new URLSearchParams({
    returnTo: path,
    prompt: "login",
    max_age: "0",
    acr_values: MFA_ACR_VALUES,
  });
  return `/auth/login?${params.toString()}`;
}

/**
 * Clears the app session, then starts MFA step-up login.
 * Required because a plain /auth/login often reuses the Auth0 SSO cookie without MFA claims.
 */
export function adminMfaStepUpHref(returnTo = "/admin"): string {
  const login = auth0StepUpLoginPath(returnTo);
  return `/auth/logout?returnTo=${encodeURIComponent(login)}`;
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
