import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("sign-in Okta-only UX", () => {
  const source = readFileSync(
    join(process.cwd(), "src/app/sign-in/page.tsx"),
    "utf8"
  );

  it("wires AUTH0_OKTA_CONNECTION to Sign in / Sign up when Okta-only", () => {
    expect(source).toContain("AUTH0_OKTA_CONNECTION");
    expect(source).toContain("isOktaOnlySignIn");
    expect(source).toContain('data-testid="login-continue-okta"');
    expect(source).toContain('data-testid="login-signup"');
    expect(source).toContain("Sign in");
    expect(source).toContain("Sign up");
  });

  it("shows branded buttons instead of silent Auth0 auto-forward", () => {
    expect(source).not.toMatch(/redirect\(auth0LoginUrl/);
    expect(source).toContain('data-testid="login-continue-google"');
    expect(source).toContain('data-testid="login-continue-email"');
    expect(source).toContain("set_password");
    expect(source).toContain("HINT_COPY");
  });

  it("passes connection= on Okta Sign in and forces login only after errors", () => {
    expect(source).toContain('params.set("connection", connection)');
    expect(source).toContain("Boolean(errorText)");
    expect(source).toContain('params.set("prompt", "login")');
  });
});

describe("sign-up page", () => {
  it("exists for first-time Okta password setup", () => {
    const source = readFileSync(join(process.cwd(), "src/app/sign-up/page.tsx"), "utf8");
    expect(source).toContain('data-testid="okta-signup-form"');
    expect(source).toContain("/api/auth/okta-signup");
  });
});
