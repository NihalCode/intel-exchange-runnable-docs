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

  it("uses Okta connection for silent redirect when configured", () => {
    expect(source).toContain("auth0LoginUrl(oktaConnection || undefined");
  });
});
