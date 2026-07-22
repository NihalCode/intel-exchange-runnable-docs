import { readFileSync } from "node:fs";
import path from "node:path";

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";

import { buildSignInUrl, auth0LoginPath, signInUrlFor } from "@/lib/documentation-auth/sign-in-url";
import {
  adminMfaStepUpHref,
  auth0LogoutToOriginPath,
  auth0StepUpLoginPath,
  MFA_ACR_VALUES,
  MFA_STEP_UP_START_PATH,
} from "@/lib/enterprise/mfa-step-up";

function source(relative: string): string {
  return readFileSync(path.join(process.cwd(), relative), "utf8");
}

describe("MFA loop regression (local)", () => {
  it("does not use bare /auth/login?returnTo=/admin for MFA denial CTA", () => {
    const layout = source("src/app/admin/layout.tsx");
    expect(layout).toContain("adminMfaStepUpHref");
    expect(layout).toContain("Sign out and complete MFA");
    expect(layout).toContain('case "mfa_required"');
    // MFA CTA must go through logout+step-up, not a plain login href literal.
    const mfaBlock = layout.slice(
      layout.indexOf('case "mfa_required"'),
      layout.indexOf('case "organization_context"')
    );
    expect(mfaBlock).toContain("adminMfaStepUpHref");
    expect(mfaBlock).not.toContain('"/auth/login?returnTo=/admin"');
  });

  it("MFA step-up clears app session then forces Auth0 re-auth + MFA ACR", () => {
    const href = adminMfaStepUpHref("/admin");
    expect(href).toBe(`${MFA_STEP_UP_START_PATH}?returnTo=${encodeURIComponent("/admin")}`);
    const logout = auth0LogoutToOriginPath("https://cyware-docs-csap.vercel.app");
    expect(logout.startsWith("/auth/logout?returnTo=")).toBe(true);
    const returnTo = decodeURIComponent(logout.slice("/auth/logout?returnTo=".length));
    expect(returnTo).toBe("https://cyware-docs-csap.vercel.app");
    expect(returnTo).not.toContain("/auth/login");
    const login = auth0StepUpLoginPath("/admin");
    expect(login).toContain("prompt=login");
    expect(login).toContain("max_age=0");
    expect(login).toContain(encodeURIComponent(MFA_ACR_VALUES));
  });

  it("normal product login never forces prompt=login (one MFA for all tabs/SSO)", () => {
    const silent = auth0LoginPath("/agent");
    expect(silent).toBe("/auth/login?returnTo=%2Fagent");
    expect(silent).not.toContain("prompt=");
    expect(silent).not.toContain("max_age=");
    expect(silent).not.toContain("acr_values=");
  });
});

describe("one-time login URL contracts (local)", () => {
  beforeEach(() => {
    delete process.env.CROSS_DOMAIN_SSO_ENABLED;
    delete process.env.AUTH_DOMAIN;
  });

  it("buildSignInUrl uses Auth0 login for silent SSO, not branded interstitial", async () => {
    const request = new NextRequest("https://docs.example.com/agent", {
      headers: { referer: "https://docs.example.com/agent?x=1" },
    });
    const url = await buildSignInUrl(request);
    expect(url).toContain("/auth/login");
    expect(url).not.toContain("/sign-in");
    expect(url).toContain(encodeURIComponent("/agent?x=1"));
    expect(url).not.toContain("prompt=");
  });

  it("signInUrlFor keeps branded /sign-in for explicit connection choice", () => {
    const request = new NextRequest("https://docs.example.com/api/agent");
    expect(signInUrlFor(request)).toContain("/sign-in");
  });

  it("workspace + admin page redirects prefer /auth/login for SSO", () => {
    expect(source("src/lib/documentation-auth/protect-layout.ts")).toContain(
      "/auth/login?returnTo="
    );
    expect(source("src/lib/admin/page-data.ts")).toContain("/auth/login?returnTo=/admin");
    expect(source("src/components/AppFrame.tsx")).toContain("/auth/login?returnTo=");
    expect(source("src/components/agent-chat-state.tsx")).toContain(
      "/auth/login?returnTo="
    );
  });

  it("sign-in page auto-forwards to Auth0 when there is no error", () => {
    const page = source("src/app/sign-in/page.tsx");
    expect(page).toContain("redirect(auth0LoginUrl(undefined, returnTo || \"/\")");
  });

  it("cross-host post-login bounces through target /auth/login for cookie minting", () => {
    const page = source("src/app/post-login/page.tsx");
    expect(page).toContain("/auth/login");
    expect(page).toContain("targetHostname");
  });
});
