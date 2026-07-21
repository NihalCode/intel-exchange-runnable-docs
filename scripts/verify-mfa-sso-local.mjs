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
  return `/auth/logout?returnTo=${encodeURIComponent(auth0StepUpLoginPath(returnTo))}`;
}

function auth0LoginPath(returnTo = "/") {
  return `/auth/login?${new URLSearchParams({ returnTo }).toString()}`;
}

/** Old broken loop: plain login reuses password-only Auth0 SSO → no amr → MFA page again */
const OLD_LOOP = "/auth/login?returnTo=/admin";
/** Fixed: clear app cookie, force re-auth + MFA ACR */
const FIXED = adminMfaStepUpHref("/admin");
/** Normal tab/product visit: silent SSO, never force MFA again */
const SILENT = auth0LoginPath("/agent");

assert.equal(OLD_LOOP.includes("prompt="), false, "old path had no prompt=login");
assert.match(FIXED, /^\/auth\/logout\?returnTo=/);
assert.match(decodeURIComponent(FIXED.split("returnTo=")[1]), /prompt=login/);
assert.match(decodeURIComponent(FIXED.split("returnTo=")[1]), /max_age=0/);
assert.equal(SILENT.includes("prompt="), false);
assert.equal(SILENT.includes("max_age="), false);

console.log(
  JSON.stringify(
    {
      status: "PASS",
      mfaLoop: {
        oldBrokenCta: OLD_LOOP,
        fixedCta: FIXED,
        why:
          "Plain /auth/login reuses Auth0 SSO without MFA claims (amr/acr) → same page. Logout + prompt=login&max_age=0 forces a fresh MFA.",
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
