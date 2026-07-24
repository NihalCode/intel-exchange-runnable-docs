import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  getAuthConnectionOrDefault,
  isOktaBrokerLogin,
  passwordLoginPath,
} from "@/lib/documentation-auth/password-connection";
import {
  encodeFreshLoginCookie,
  freshLoginStartHref,
  freshPasswordLoginPath,
  parseFreshLoginCookie,
  sanitizeFreshLoginReturnTo,
} from "@/lib/documentation-auth/fresh-login";

describe("passwordLoginPath (Okta broker)", () => {
  afterEach(() => {
    delete process.env.AUTH0_OKTA_CONNECTION;
    delete process.env.AUTH0_EMAIL_CONNECTION;
    delete process.env.AUTH0_DATABASE_CONNECTION;
  });

  it("defaults to Okta Workforce connection name and forces prompt=login", () => {
    expect(getAuthConnectionOrDefault()).toBe("Cyware-Docs-Auth0");
    expect(passwordLoginPath()).toContain("connection=Cyware-Docs-Auth0");
    expect(passwordLoginPath()).toContain("prompt=login");
    expect(passwordLoginPath({ forceLogin: false })).not.toContain("prompt=");
  });

  it("uses AUTH0_OKTA_CONNECTION and never Auth0 Database screen_hint", () => {
    process.env.AUTH0_OKTA_CONNECTION = "Cyware-Docs-Auth0";
    expect(isOktaBrokerLogin()).toBe(true);
    expect(passwordLoginPath({ signUp: true })).toContain("connection=Cyware-Docs-Auth0");
    expect(passwordLoginPath({ signUp: true })).not.toContain("screen_hint=");
  });
});

describe("freshLogin", () => {
  afterEach(() => {
    delete process.env.AUTH0_OKTA_CONNECTION;
  });

  it("encodes cookie and builds Okta broker login after logout-to-origin", () => {
    process.env.AUTH0_OKTA_CONNECTION = "Cyware-Docs-Auth0";
    expect(encodeFreshLoginCookie("login", "/agent")).toBe("login|/agent");
    expect(parseFreshLoginCookie("signup|/docs")).toEqual({
      mode: "signup",
      returnTo: "/docs",
    });
    expect(freshLoginStartHref("login", "/agent")).toBe(
      "/access/fresh-login?mode=login&returnTo=%2Fagent"
    );
    const path = freshPasswordLoginPath("login|/agent");
    expect(path).toContain("connection=Cyware-Docs-Auth0");
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
});

describe("sign-in Okta-only UX contract", () => {
  const source = readFileSync(join(process.cwd(), "src/app/sign-in/page.tsx"), "utf8");

  it("exposes Sign in via fresh-login and Sign up via /sign-up; no Google CTAs", () => {
    expect(source).toContain("freshLoginStartHref");
    expect(source).toContain('data-testid="login-continue-password"');
    expect(source).toContain('data-testid="login-signup"');
    expect(source).toContain("/sign-up");
    expect(source).not.toContain("login-continue-google");
    expect(source).not.toContain("login-continue-okta");
    expect(source).toContain("Okta Verify");
    expect(source).toContain("set_password");
  });
});

describe("sign-up page", () => {
  it("collects email for Okta password setup (not Auth0 Database signup)", () => {
    const source = readFileSync(join(process.cwd(), "src/app/sign-up/page.tsx"), "utf8");
    expect(source).toContain("OktaSignUpForm");
    expect(source).toContain("Set up your account");
    expect(source).not.toContain("freshLoginStartHref");
  });
});

describe("Add user / invite UX contract", () => {
  it("describes Okta provision + Sign up password + Okta Verify", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/auth/UsersManagementPanel.tsx"),
      "utf8"
    );
    expect(source).toContain("Creates the person in Okta");
    expect(source).toContain("Okta Verify");
    expect(source).not.toMatch(/Auth0 MFA/i);
    expect(source).not.toMatch(/Okta SSO/i);
  });
});
