import { NextRequest } from "next/server";
import { describe, expect, it, beforeEach } from "vitest";

import { buildSignInUrl, signInUrlFor } from "@/lib/documentation-auth/sign-in-url";

describe("buildSignInUrl", () => {
  beforeEach(() => {
    delete process.env.CROSS_DOMAIN_SSO_ENABLED;
    delete process.env.AUTH_DOMAIN;
  });

  it("returns same-origin sign-in path by default", async () => {
    const request = new NextRequest("https://docs.example.com/agent", {
      headers: { referer: "https://docs.example.com/agent?x=1" },
    });
    const url = await buildSignInUrl(request);
    expect(url).toContain("/sign-in");
    expect(url).toContain(encodeURIComponent("/agent?x=1"));
  });

  it("signInUrlFor remains sync fallback", () => {
    const request = new NextRequest("https://docs.example.com/api/agent");
    expect(signInUrlFor(request)).toContain("/sign-in");
  });
});
