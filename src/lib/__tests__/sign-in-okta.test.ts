import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  getPasswordConnectionOrDefault,
  passwordLoginPath,
} from "@/lib/documentation-auth/password-connection";
import {
  encodeFreshLoginCookie,
  freshLoginStartHref,
  freshPasswordLoginPath,
  parseFreshLoginCookie,
} from "@/lib/documentation-auth/fresh-login";

describe("passwordLoginPath", () => {
  it("forces Database connection, prompt=login, and supports signup screen_hint", () => {
    expect(getPasswordConnectionOrDefault()).toBe("Username-Password-Authentication");
    expect(passwordLoginPath()).toContain("connection=Username-Password-Authentication");
    expect(passwordLoginPath()).toContain("prompt=login");
    expect(passwordLoginPath({ signUp: true })).toContain("screen_hint=signup");
    expect(passwordLoginPath({ forceLogin: false })).not.toContain("prompt=");
  });
});

describe("freshLogin", () => {
  it("encodes cookie and builds password login after logout-to-origin", () => {
    expect(encodeFreshLoginCookie("login", "/agent")).toBe("login|/agent");
    expect(parseFreshLoginCookie("signup|/docs")).toEqual({
      mode: "signup",
      returnTo: "/docs",
    });
    expect(freshLoginStartHref("login", "/agent")).toBe(
      "/access/fresh-login?mode=login&returnTo=%2Fagent"
    );
    const path = freshPasswordLoginPath("login|/agent");
    expect(path).toContain("connection=Username-Password-Authentication");
    expect(path).toContain("prompt=login");
    expect(path).toContain("returnTo=%2Fagent");
  });
});

describe("sign-in clean email/password UX", () => {
  const source = readFileSync(join(process.cwd(), "src/app/sign-in/page.tsx"), "utf8");

  it("starts Sign in/up via fresh-login (logout origin only — no Auth0 Oops)", () => {
    expect(source).toContain("freshLoginStartHref");
    expect(source).toContain('data-testid="login-continue-password"');
    expect(source).toContain('data-testid="login-signup"');
    expect(source).not.toContain("login-continue-google");
  });
});

describe("sign-up page", () => {
  it("redirects through fresh-login signup", () => {
    const source = readFileSync(join(process.cwd(), "src/app/sign-up/page.tsx"), "utf8");
    expect(source).toContain("freshLoginStartHref");
    expect(source).toContain('"signup"');
  });
});
