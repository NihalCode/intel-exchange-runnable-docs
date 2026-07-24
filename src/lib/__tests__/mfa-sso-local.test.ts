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

  it("admin MFA step-up uses Okta connection (no Auth0 Guardian ACR) when brokered", () => {
    process.env.AUTH0_OKTA_CONNECTION = "Cyware-Docs-Auth0";
    const login = auth0StepUpLoginPath("/admin");
    expect(login).toContain("connection=Cyware-Docs-Auth0");
    expect(login).not.toContain("acr_values=");
    delete process.env.AUTH0_OKTA_CONNECTION;
  });

  it("normal product login never forces prompt=login (one MFA for all tabs/SSO)", () => {
    const silent = auth0LoginPath("/agent");
    expect(silent).toContain("/auth/login?");
    expect(silent).toContain("returnTo=%2Fagent");
    expect(silent).toContain("connection=Cyware-Docs-Auth0");
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
    expect(source("src/components/AppFrame.tsx")).toContain("/sign-in?returnTo=");
    expect(source("src/components/agent-chat-state.tsx")).toContain(
      "/auth/login?returnTo="
    );
  });

  it("sign-in page shows Sign in / Sign up only (password connection)", () => {
    const page = source("src/app/sign-in/page.tsx");
    expect(page).not.toMatch(/redirect\(auth0LoginUrl/);
    expect(page).toContain('data-testid="login-continue-password"');
    expect(page).toContain('data-testid="login-signup"');
    expect(page).not.toContain("login-continue-google");
  });

  it("handles fresh-login / MFA cookies before host routing (single-product hosts)", () => {
    const src = source("src/lib/documentation-auth/proxy-auth.ts");
    const freshIdx = src.indexOf("pendingFreshLogin");
    const hostIdx = src.indexOf("await applyHostRouting");
    expect(freshIdx).toBeGreaterThan(-1);
    expect(hostIdx).toBeGreaterThan(-1);
    expect(freshIdx).toBeLessThan(hostIdx);
  });
});
