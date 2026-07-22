#!/usr/bin/env node
/**
 * Local MFA / SSO path verifier (no Auth0 network calls).
 * Prints old vs new admin MFA CTA and normal silent login.
 *
 *   node scripts/verify-mfa-sso-local.mjs
 */
import assert from "node:assert/strict";

const MFA_ACR =
  "http://schemas.openid.net/pape/policies/2007/06/multi-factor";

function auth0StepUpLoginPath(returnTo = "/admin") {
  const params = new URLSearchParams({
    returnTo,
    prompt: "login",
    max_age: "0",
    acr_values: MFA_ACR,
  });
  return `/auth/login?${params.toString()}`;
}

function adminMfaStepUpHref(returnTo = "/admin") {
  return `/access/mfa-step-up?returnTo=${encodeURIComponent(returnTo)}`;
}

function auth0LogoutToOriginPath(appOrigin) {
  return `/auth/logout?returnTo=${encodeURIComponent(appOrigin.replace(/\/+$/, ""))}`;
}

function auth0LoginPath(returnTo = "/") {
  return `/auth/login?${new URLSearchParams({ returnTo }).toString()}`;
}

/** Old broken loop: plain login reuses password-only Auth0 SSO → no amr → MFA page again */
const OLD_LOOP = "/auth/login?returnTo=/admin";
/** Nested login-in-logout returnTo — Auth0 Oops (relative / non-allowlisted path) */
const OLD_OOPS = `/auth/logout?returnTo=${encodeURIComponent(auth0StepUpLoginPath("/admin"))}`;
/** Fixed: app bridge → logout to exact origin → forced MFA login */
const FIXED = adminMfaStepUpHref("/admin");
const FIXED_LOGOUT = auth0LogoutToOriginPath("https://apitest1.cyninjadev.com");
/** Normal tab/product visit: silent SSO, never force MFA again */
const SILENT = auth0LoginPath("/agent");

assert.equal(OLD_LOOP.includes("prompt="), false, "old path had no prompt=login");
assert.match(FIXED, /^\/access\/mfa-step-up\?returnTo=/);
assert.match(FIXED_LOGOUT, /^\/auth\/logout\?returnTo=/);
assert.equal(
  decodeURIComponent(FIXED_LOGOUT.split("returnTo=")[1]),
  "https://apitest1.cyninjadev.com"
);
assert.equal(
  decodeURIComponent(OLD_OOPS.split("returnTo=")[1]).startsWith("/auth/login"),
  true,
  "documents the broken nested shape"
);
assert.equal(SILENT.includes("prompt="), false);
assert.equal(SILENT.includes("max_age="), false);

console.log(
  JSON.stringify(
    {
      status: "PASS",
      mfaLoop: {
        oldBrokenCta: OLD_LOOP,
        oldAuth0OopsCta: OLD_OOPS,
        fixedCta: FIXED,
        fixedLogoutReturnTo: FIXED_LOGOUT,
        why:
          "Nesting /auth/login?... inside logout returnTo sends Auth0 a relative or non-allowlisted path → Oops. Bridge sets a cookie, logs out to the exact app origin, then forces prompt=login&max_age=0.",
      },
      oneTimeLogin: {
        silentPerOrigin: SILENT,
        why:
          "After first MFA, later tabs/hosts use /auth/login without prompt so Auth0 SSO completes silently and mints a per-host cookie once.",
      },
    },
    null,
    2
  )
);
