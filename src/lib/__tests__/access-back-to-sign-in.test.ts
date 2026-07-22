import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { accessBackToSignInHref } from "@/lib/documentation-auth/access-sign-in";

function source(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("access gate → Back to sign in", () => {
  it("builds a branded /sign-in href with error so auto-SSO cannot bounce", () => {
    expect(accessBackToSignInHref("invite_required")).toBe(
      "/sign-in?error=invite_required"
    );
    expect(accessBackToSignInHref("wrong_email")).toBe("/sign-in?error=wrong_email");
    expect(accessBackToSignInHref("")).toBe("/sign-in?error=auth_denied");
    expect(accessBackToSignInHref()).toBe("/sign-in?error=auth_denied");
  });

  it("AccessPage hard-navigates via <a>, not next/link soft nav", () => {
    const page = source("src/components/auth/AccessPage.tsx");
    expect(page).not.toMatch(/from ["']next\/link["']/);
    expect(page).toContain('data-testid="access-back-to-sign-in"');
    expect(page).toContain("accessBackToSignInHref");
    expect(page).toMatch(/<a[\s\S]*href=\{signInHref\}/);
  });

  it("access pages pass the matching sign-in error code", () => {
    expect(source("src/app/access/invite-required/page.tsx")).toContain(
      'signInError="invite_required"'
    );
    expect(source("src/app/access/invite-expired/page.tsx")).toContain(
      'signInError="expired_invite"'
    );
    expect(source("src/app/access/disabled/page.tsx")).toContain(
      'signInError="disabled"'
    );
    expect(source("src/app/access/wrong-email/page.tsx")).toContain(
      'signInError="wrong_email"'
    );
  });

  it("sign-in Continue forces prompt=login when an error interstitial is shown", () => {
    const signIn = source("src/app/sign-in/page.tsx");
    expect(signIn).toContain('params.set("prompt", "login")');
    expect(signIn).toContain("Boolean(errorText)");
  });
});
