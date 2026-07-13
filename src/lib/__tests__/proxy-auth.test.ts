import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it } from "vitest";

import {
  continueWithAuthHeaders,
  mergeAuthHeaders,
} from "@/lib/documentation-auth/proxy-auth";

describe("proxy-auth helpers", () => {
  it("mergeAuthHeaders copies Set-Cookie from Auth0 middleware response", () => {
    const base = NextResponse.next();
    const auth = NextResponse.next();
    auth.headers.set("Set-Cookie", "appSession=abc; Path=/; HttpOnly");
    auth.headers.set("x-middleware-next", "1");

    const merged = mergeAuthHeaders(base, auth);

    expect(merged.headers.get("Set-Cookie")).toContain("appSession=abc");
  });

  it("continueWithAuthHeaders merges session cookies on successful navigation", () => {
    const request = new NextRequest("https://docs.example.com/docs/ctix/ping?q=1");
    const auth = NextResponse.next();
    auth.headers.set("Set-Cookie", "appSession=rolling; Path=/; HttpOnly");

    const response = continueWithAuthHeaders(request, auth);

    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toContain("appSession=rolling");
  });

  it("continueWithAuthHeaders preserves Auth0 redirects unchanged", () => {
    const request = new NextRequest("https://docs.example.com/docs/ctix");
    const auth = NextResponse.redirect("https://docs.example.com/auth/login");

    const response = continueWithAuthHeaders(request, auth);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/auth/login");
  });
});
