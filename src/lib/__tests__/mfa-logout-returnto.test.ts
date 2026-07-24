import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import {
  isAuthLogoutPath,
  withAbsoluteLogoutReturnTo,
} from "@/lib/documentation-auth/oauth-route-handlers";
import {
  adminMfaStepUpHref,
  auth0LogoutToOriginPath,
  auth0StepUpLoginPath,
} from "@/lib/enterprise/mfa-step-up";

describe("Auth0 MFA logout returnTo shape", () => {
  afterEach(() => {
    delete process.env.AUTH0_OKTA_CONNECTION;
  });
  it("detects logout paths", () => {
    expect(isAuthLogoutPath("/auth/logout")).toBe(true);
    expect(isAuthLogoutPath("/auth/login")).toBe(false);
  });

  it("absolute-izes relative logout returnTo against APP_BASE_URL", () => {
    const req = new NextRequest(
      "https://apitest1.cyninjadev.com/auth/logout?returnTo=%2F"
    );
    const fixed = withAbsoluteLogoutReturnTo(
      req,
      "https://apitest1.cyninjadev.com"
    );
    expect(fixed.nextUrl.searchParams.get("returnTo")).toBe(
      "https://apitest1.cyninjadev.com/"
    );
  });

  it("leaves absolute logout returnTo unchanged", () => {
    const origin = "https://cyware-docs-cftr.vercel.app";
    const req = new NextRequest(
      `https://cyware-docs-cftr.vercel.app/auth/logout?returnTo=${encodeURIComponent(origin)}`
    );
    const fixed = withAbsoluteLogoutReturnTo(req, origin);
    expect(fixed.nextUrl.searchParams.get("returnTo")).toBe(origin);
  });

  it("never nests step-up login inside logout returnTo (Auth0 Oops regression)", () => {
    process.env.AUTH0_OKTA_CONNECTION = "test-okta-workforce";
    const href = adminMfaStepUpHref("/admin");
    expect(href).not.toContain("/auth/logout");
    expect(href).toContain("/access/mfa-step-up");
    const nestedBroken = `/auth/logout?returnTo=${encodeURIComponent(auth0StepUpLoginPath("/admin"))}`;
    const nestedReturnTo = decodeURIComponent(nestedBroken.split("returnTo=")[1]!);
    expect(nestedReturnTo.startsWith("/auth/login")).toBe(true);
    const safe = auth0LogoutToOriginPath("https://cyware-docs-csap.vercel.app");
    expect(decodeURIComponent(safe.split("returnTo=")[1]!)).toBe(
      "https://cyware-docs-csap.vercel.app"
    );
  });
});
