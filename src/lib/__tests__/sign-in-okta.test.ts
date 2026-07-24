import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  getAuthConnectionOrDefault,
  getRequiredOktaConnection,
  isOktaBrokerLogin,
  isOktaConnectionConfigured,
  passwordLoginPath,
} from "@/lib/documentation-auth/password-connection";
import {
  encodeFreshLoginCookie,
  freshLoginNeedsCanonicalHost,
  freshLoginStartHref,
  freshPasswordLoginPath,
  parseFreshLoginCookie,
  resolveFreshLoginLogoutOrigin,
  sanitizeFreshLoginReturnTo,
} from "@/lib/documentation-auth/fresh-login";
import { auth0LoginPath } from "@/lib/documentation-auth/sign-in-url";
import { auth0StepUpLoginPath } from "@/lib/enterprise/mfa-step-up";
import { authEnvValidationError, isAuthEnvComplete } from "@/lib/documentation-auth/env";

const TEST_CONNECTION = "test-okta-workforce";

describe("required Okta enterprise connection", () => {
  afterEach(() => {
    delete process.env.AUTH0_OKTA_CONNECTION;
  });

  it("fails closed when AUTH0_OKTA_CONNECTION is missing", () => {
    expect(isOktaConnectionConfigured()).toBe(false);
    expect(() => getRequiredOktaConnection()).toThrow(/AUTH0_OKTA_CONNECTION/);
    expect(() => getAuthConnectionOrDefault()).toThrow(/AUTH0_OKTA_CONNECTION/);
    expect(() => passwordLoginPath()).toThrow(/AUTH0_OKTA_CONNECTION/);
  });

  it("returns the configured connection and forces it on login paths", () => {
    process.env.AUTH0_OKTA_CONNECTION = `  ${TEST_CONNECTION}  `;
    expect(isOktaBrokerLogin()).toBe(true);
    expect(getRequiredOktaConnection()).toBe(TEST_CONNECTION);
    const path = passwordLoginPath({ returnTo: "/agent" });
    expect(path).toContain(`connection=${TEST_CONNECTION}`);
    expect(path).toContain("prompt=login");
    expect(path).toContain("returnTo=%2Fagent");
    expect(path).not.toContain("screen_hint=");
    expect(path).not.toContain("google");
    expect(path).not.toContain("Username-Password");
  });

  it("applies the same connection on silent product login and admin step-up", () => {
    process.env.AUTH0_OKTA_CONNECTION = TEST_CONNECTION;
    expect(auth0LoginPath("/agent")).toContain(`connection=${TEST_CONNECTION}`);
    expect(auth0LoginPath("/agent")).not.toContain("prompt=");
    const stepUp = auth0StepUpLoginPath("/admin");
    expect(stepUp).toContain(`connection=${TEST_CONNECTION}`);
    expect(stepUp).not.toContain("acr_values=");
  });
});

describe("auth env requires AUTH0_OKTA_CONNECTION", () => {
  afterEach(() => {
    delete process.env.AUTH0_OKTA_CONNECTION;
    delete process.env.AUTH0_ISSUER_BASE_URL;
    delete process.env.AUTH0_CLIENT_ID;
    delete process.env.AUTH0_CLIENT_SECRET;
    delete process.env.AUTH0_SECRET;
    delete process.env.APP_BASE_URL;
  });

  it("is incomplete without Okta connection even when other Auth0 vars are set", () => {
    process.env.AUTH0_ISSUER_BASE_URL = "https://example.auth0.com";
    process.env.AUTH0_CLIENT_ID = "client";
    process.env.AUTH0_CLIENT_SECRET = "secret";
    process.env.AUTH0_SECRET = "x".repeat(32);
    process.env.APP_BASE_URL = "https://docs.example.com";
    expect(isAuthEnvComplete()).toBe(false);
    expect(authEnvValidationError()).toMatch(/AUTH0_OKTA_CONNECTION/);
    process.env.AUTH0_OKTA_CONNECTION = TEST_CONNECTION;
    expect(isAuthEnvComplete()).toBe(true);
  });
});

describe("freshLogin", () => {
  afterEach(() => {
    delete process.env.AUTH0_OKTA_CONNECTION;
  });

  it("encodes cookie and builds Okta broker login after logout-to-origin", () => {
    process.env.AUTH0_OKTA_CONNECTION = TEST_CONNECTION;
    expect(encodeFreshLoginCookie("login", "/agent")).toBe("login|/agent");
    expect(parseFreshLoginCookie("signup|/docs")).toEqual({
      mode: "signup",
      returnTo: "/docs",
    });
    expect(freshLoginStartHref("login", "/agent")).toBe(
      "/access/fresh-login?mode=login&returnTo=%2Fagent"
    );
    const path = freshPasswordLoginPath("login|/agent");
    expect(path).toContain(`connection=${TEST_CONNECTION}`);
    expect(path).toContain("prompt=login");
    expect(path).toContain("returnTo=%2Fagent");
  });

  it("sanitizes returnTo against open redirects and auth loops", () => {
    expect(sanitizeFreshLoginReturnTo("//evil.example")).toBe("/");
    expect(sanitizeFreshLoginReturnTo("https://evil.example")).toBe("/");
    expect(sanitizeFreshLoginReturnTo("/access/fresh-login?mode=login")).toBe("/");
    expect(sanitizeFreshLoginReturnTo("/auth/login")).toBe("/");
    expect(sanitizeFreshLoginReturnTo("/sign-in")).toBe("/");
    expect(sanitizeFreshLoginReturnTo("/agent?x=1")).toBe("/agent?x=1");
  });

  it("prefers APP_BASE_URL for logout origin and detects alias-host mismatch", () => {
    const canonical = "https://apitest1.cyninjadev.com";
    const alias = "https://cyware-docs-ctix.vercel.app";
    expect(resolveFreshLoginLogoutOrigin(alias, canonical)).toBe(canonical);
    expect(resolveFreshLoginLogoutOrigin(canonical, canonical)).toBe(canonical);
    expect(resolveFreshLoginLogoutOrigin(alias, null)).toBe(alias);
    expect(freshLoginNeedsCanonicalHost(alias, canonical)).toBe(true);
    expect(freshLoginNeedsCanonicalHost(canonical, canonical)).toBe(false);
  });

  it("fresh-login route canonicalizes onto APP_BASE_URL before setting the cookie", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/access/fresh-login/route.ts"),
      "utf8"
    );
    expect(source).toContain("freshLoginNeedsCanonicalHost");
    expect(source).toContain("resolveFreshLoginLogoutOrigin");
    expect(source).toContain("getAuthCookieDomain");
  });
});

describe("Auth0Client + UI contracts", () => {
  it("Auth0Client merges Okta connection into authorizationParameters", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/auth0.ts"), "utf8");
    expect(source).toContain("getRequiredOktaConnection");
    expect(source).toContain("authorizationParameters");
    expect(source).toContain('scope: "openid profile email"');
    expect(source).toContain("connection: getRequiredOktaConnection()");
    expect(source).not.toMatch(/api\.multifactor\.enable/);
  });

  it("agent chat session-expired fallback uses branded /sign-in, not bare /auth/login", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/agent-chat-state.tsx"),
      "utf8"
    );
    expect(source).toContain("`/sign-in?returnTo=${encodeURIComponent(returnPath)}`");
    expect(source).not.toMatch(/fallbackSignIn\s*=\s*`\/auth\/login/);
  });

  it("admin step-up uses getRequiredOktaConnection and never ACR multifactor", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/enterprise/mfa-step-up.ts"),
      "utf8"
    );
    expect(source).toContain("getRequiredOktaConnection");
    expect(source).not.toMatch(/acr_values/);
    expect(source).not.toContain("MFA_ACR_VALUES");
  });

  it("sign-in routes Sign in via fresh-login and Sign up via /sign-up", () => {
    const source = readFileSync(join(process.cwd(), "src/app/sign-in/page.tsx"), "utf8");
    expect(source).toContain("freshLoginStartHref");
    expect(source).toContain('data-testid="login-continue-password"');
    expect(source).toContain('data-testid="login-signup"');
    expect(source).toContain("/sign-up");
    expect(source).not.toContain("login-continue-google");
    expect(source).not.toContain("login-continue-okta");
    expect(source).toContain("Okta Verify");
  });

  it("sign-up uses Okta password setup, not Auth0 Database signup", () => {
    const source = readFileSync(join(process.cwd(), "src/app/sign-up/page.tsx"), "utf8");
    expect(source).toContain("OktaSignUpForm");
    expect(source).toContain("Set up your account");
    expect(source).not.toContain("freshLoginStartHref");
    expect(source).not.toContain("screen_hint");
  });

  it("Add user copy describes Okta provision + Verify", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/auth/UsersManagementPanel.tsx"),
      "utf8"
    );
    expect(source).toContain("Creates the person in Okta");
    expect(source).toContain("Okta Verify");
    expect(source).not.toMatch(/Auth0 MFA/i);
    expect(source).not.toMatch(/Okta SSO/i);
  });

  it("invite acceptance primary CTA sends first-time users to Sign up", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/invite/InvitePageClient.tsx"),
      "utf8"
    );
    expect(source).toContain('data-testid="invite-continue-signup"');
    expect(source).toContain("/sign-up");
    expect(source).toContain("E0000004");
    expect(source).toContain('data-testid="invite-continue-login"');
  });

  it("Sign up success redirects with check_email hint, not set_password_done", () => {
    const route = readFileSync(
      join(process.cwd(), "src/app/api/auth/okta-signup/route.ts"),
      "utf8"
    );
    const form = readFileSync(
      join(process.cwd(), "src/components/auth/OktaSignUpForm.tsx"),
      "utf8"
    );
    expect(route).toContain("hint=check_email");
    expect(form).toContain("hint=check_email");
    expect(route).not.toContain("hint=set_password_done");
  });
});
