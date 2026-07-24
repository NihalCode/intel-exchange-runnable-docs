import { NextRequest } from "next/server";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { buildSignInUrl, signInUrlFor } from "@/lib/documentation-auth/sign-in-url";

describe("buildSignInUrl", () => {
  beforeEach(() => {
    delete process.env.CROSS_DOMAIN_SSO_ENABLED;
    delete process.env.AUTH_DOMAIN;
    process.env.AUTH0_OKTA_CONNECTION = "test-okta-workforce";
  });

  afterEach(() => {
    delete process.env.AUTH0_OKTA_CONNECTION;
  });

  it("returns Auth0 login path for silent SSO by default", async () => {
    const request = new NextRequest("https://docs.example.com/agent", {
      headers: { referer: "https://docs.example.com/agent?x=1" },
    });
    const url = await buildSignInUrl(request);
    expect(url).toContain("/auth/login");
    expect(url).toContain("connection=test-okta-workforce");
    expect(url).toContain(encodeURIComponent("/agent?x=1"));
    expect(url).not.toContain("prompt=");
  });

  it("signInUrlFor remains sync branded interstitial fallback", () => {
    const request = new NextRequest("https://docs.example.com/api/agent");
    expect(signInUrlFor(request)).toContain("/sign-in");
  });
});
