import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it } from "vitest";

import {
  continueWithAuthHeaders,
  mergeAuthHeaders,
  signInUrlFor,
  unauthorizedApiResponse,
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

describe("unauthorized API response (agent chat regression)", () => {
  it("returns an actionable 401 body instead of bare 'Unauthorized'", async () => {
    const request = new NextRequest("https://docs.example.com/api/agent", {
      method: "POST",
    });
    const auth = NextResponse.next();

    const response = await unauthorizedApiResponse(request, auth);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Session expired — sign in again");
    expect(body.code).toBe("SESSION_EXPIRED");
    expect(typeof body.signIn).toBe("string");
    expect(body.signIn).toContain("/sign-in");
    // Must never regress to the opaque bare-string message.
    expect(body.error).not.toBe("Unauthorized");
  });

  it("merges Auth0 rolling-session cookies onto the 401 so a retry can succeed", async () => {
    const request = new NextRequest("https://docs.example.com/api/agent", {
      method: "POST",
    });
    const auth = NextResponse.next();
    auth.headers.set("Set-Cookie", "appSession=rotated; Path=/; HttpOnly");

    const response = await unauthorizedApiResponse(request, auth);

    expect(response.status).toBe(401);
    expect(response.headers.get("Set-Cookie")).toContain("appSession=rotated");
  });

  it("signInUrlFor prefers the same-origin referring page for returnTo", () => {
    const request = new NextRequest("https://docs.example.com/api/agent", {
      method: "POST",
      headers: { referer: "https://docs.example.com/agent?chat=1" },
    });

    const url = signInUrlFor(request);

    expect(url).toContain("/sign-in");
    expect(url).toContain(
      `returnTo=${encodeURIComponent("/agent?chat=1")}`
    );
  });

  it("signInUrlFor ignores cross-origin Referer and falls back to the request path", () => {
    const request = new NextRequest("https://docs.example.com/api/agent", {
      method: "POST",
      headers: { referer: "https://evil.example.com/phish" },
    });

    const url = signInUrlFor(request);

    expect(url).toContain(`returnTo=${encodeURIComponent("/api/agent")}`);
    expect(url).not.toContain("evil.example.com");
  });
});
