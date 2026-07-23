import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  getPasswordConnectionOrDefault,
  passwordLoginPath,
} from "@/lib/documentation-auth/password-connection";

describe("passwordLoginPath", () => {
  it("forces Database connection and supports signup screen_hint", () => {
    expect(getPasswordConnectionOrDefault()).toBe("Username-Password-Authentication");
    expect(passwordLoginPath()).toContain("connection=Username-Password-Authentication");
    expect(passwordLoginPath({ signUp: true })).toContain("screen_hint=signup");
    expect(passwordLoginPath()).not.toContain("screen_hint");
  });
});

describe("sign-in clean email/password UX", () => {
  const source = readFileSync(join(process.cwd(), "src/app/sign-in/page.tsx"), "utf8");

  it("only offers Sign in and Sign up via passwordLoginPath", () => {
    expect(source).toContain("passwordLoginPath");
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
