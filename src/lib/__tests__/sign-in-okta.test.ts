import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  getPasswordConnectionOrDefault,
  passwordLoginPath,
} from "@/lib/documentation-auth/password-connection";

describe("passwordLoginPath", () => {
  it("forces Database connection, prompt=login, and supports signup screen_hint", () => {
    expect(getPasswordConnectionOrDefault()).toBe("Username-Password-Authentication");
    expect(passwordLoginPath()).toContain("connection=Username-Password-Authentication");
    expect(passwordLoginPath()).toContain("prompt=login");
    expect(passwordLoginPath({ signUp: true })).toContain("screen_hint=signup");
    expect(passwordLoginPath({ forceLogin: false })).not.toContain("prompt=");
  });
});

describe("sign-in clean email/password UX", () => {
  const source = readFileSync(join(process.cwd(), "src/app/sign-in/page.tsx"), "utf8");

  it("clears sticky Auth0 session before Sign in/up then forces password login", () => {
    expect(source).toContain("passwordLoginPath");
    expect(source).toContain("/auth/logout?returnTo=");
    expect(source).toContain('data-testid="login-continue-password"');
    expect(source).toContain('data-testid="login-signup"');
    expect(source).not.toContain("login-continue-google");
    expect(source).not.toContain("login-continue-okta");
  });
});

describe("sign-up page", () => {
  it("redirects to Auth0 Database signup", () => {
    const source = readFileSync(join(process.cwd(), "src/app/sign-up/page.tsx"), "utf8");
    expect(source).toContain("passwordLoginPath");
    expect(source).toContain("signUp: true");
  });
});
