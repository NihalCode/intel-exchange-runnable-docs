import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { GET as freshLoginGet } from "@/app/access/fresh-login/route";
import { authReturnToFromPath } from "@/lib/documentation-auth/auth-return-to-path";
import {
  FRESH_LOGIN_COOKIE,
  freshPasswordLoginPath,
} from "@/lib/documentation-auth/fresh-login";

const CANONICAL = "https://apitest1.cyninjadev.com";
const ALIAS = "https://cyware-docs-ctix.vercel.app";

describe("Sign-in returnTo home-loop chain (Mode A)", () => {
  afterEach(() => {
    delete process.env.APP_BASE_URL;
    delete process.env.AUTH0_BASE_URL;
    delete process.env.AUTH0_OKTA_CONNECTION;
    delete process.env.CROSS_DOMAIN_SSO_ENABLED;
    delete process.env.AUTH_COOKIE_DOMAIN;
    delete process.env.VERCEL_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_BRANCH_URL;
  });

  it("alias host canonicalizes before minting cyware_fresh_login", async () => {
    process.env.APP_BASE_URL = CANONICAL;
    const req = new NextRequest(
      `${ALIAS}/access/fresh-login?mode=login&returnTo=${encodeURIComponent("/agent")}`
    );
    const res = await freshLoginGet(req);
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const location = res.headers.get("location");
    expect(location).toBe(
      `${CANONICAL}/access/fresh-login?mode=login&returnTo=${encodeURIComponent("/agent")}`
    );
    expect(res.cookies.get(FRESH_LOGIN_COOKIE)?.value).toBeUndefined();
  });

  it("canonical host sets cookie then logout returnTo = APP origin only", async () => {
    process.env.APP_BASE_URL = CANONICAL;
    process.env.AUTH0_OKTA_CONNECTION = "okta-workforce";
    const req = new NextRequest(
      `${CANONICAL}/access/fresh-login?mode=login&returnTo=${encodeURIComponent("/agent")}`
    );
    const res = await freshLoginGet(req);
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const location = res.headers.get("location") ?? "";
    expect(location.startsWith(`${CANONICAL}/auth/logout`)).toBe(true);
    expect(location).toContain(`returnTo=${encodeURIComponent(CANONICAL)}`);
    expect(location).not.toContain("/auth/login");
    expect(res.cookies.get(FRESH_LOGIN_COOKIE)?.value).toBe("login|/agent");
  });

  it("cookie bridge resumes /auth/login with deep-link returnTo (not /)", () => {
    process.env.AUTH0_OKTA_CONNECTION = "okta-workforce";
    const path = freshPasswordLoginPath("login|/agent");
    expect(path).toContain("returnTo=%2Fagent");
    expect(path).toContain("prompt=login");
    expect(path).not.toMatch(/returnTo=%2F(&|$)/);
  });

  it("Mode B: shell Sign in from /agent keeps returnTo=/agent; auth routes collapse to /", () => {
    expect(authReturnToFromPath("/agent")).toBe("/agent");
    expect(authReturnToFromPath("/docs/ctix/ping")).toBe("/docs/ctix/ping");
    expect(authReturnToFromPath("/sign-in")).toBe("/");
    expect(authReturnToFromPath("/sign-in?returnTo=%2Fagent")).toBe("/");
    expect(authReturnToFromPath("/")).toBe("/");
  });
});
