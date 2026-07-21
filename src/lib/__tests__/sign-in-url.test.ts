import { NextRequest } from "next/server";
import { describe, expect, it, beforeEach } from "vitest";

import { buildSignInUrl, signInUrlFor } from "@/lib/documentation-auth/sign-in-url";

describe("buildSignInUrl", () => {
  beforeEach(() => {
    delete process.env.CROSS_DOMAIN_SSO_ENABLED;
    delete process.env.AUTH_DOMAIN;
  });

  it("returns Auth0 login path for silent SSO by default", async () => {
    const request = new NextRequest("https://docs.example.com/agent", {
      headers: { referer: "https://docs.example.com/agent?x=1" },
    });
    const url = await buildSignInUrl(request);
    expect(url).toContain("/auth/login");
    expect(url).toContain(encodeURIComponent("/agent?x=1"));
    expect(url).not.toContain("prompt=");
  });

  it("signInUrlFor remains sync branded interstitial fallback", () => {
    const request = new NextRequest("https://docs.example.com/api/agent");
    expect(signInUrlFor(request)).toContain("/sign-in");
  });
});
