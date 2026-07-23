import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("sign-in Okta federation CTA", () => {
  const source = readFileSync(
    join(process.cwd(), "src/app/sign-in/page.tsx"),
    "utf8"
  );

  it("wires AUTH0_OKTA_CONNECTION to Continue with Okta", () => {
    expect(source).toContain("AUTH0_OKTA_CONNECTION");
    expect(source).toContain('data-testid="login-continue-okta"');
    expect(source).toContain("Continue with Okta");
  });

  it("shows branded connection buttons instead of silent Auth0 auto-forward", () => {
    expect(source).not.toMatch(/redirect\(auth0LoginUrl/);
    expect(source).toContain('data-testid="login-continue-google"');
    expect(source).toContain('data-testid="login-continue-email"');
    expect(source).toContain("AUTH0_DATABASE_CONNECTION");
  });

  it("passes connection= on each CTA and forces login after errors", () => {
    expect(source).toContain('params.set("connection", connection)');
    expect(source).toContain("Boolean(errorText)");
    expect(source).toContain('params.set("prompt", "login")');
  });
});
