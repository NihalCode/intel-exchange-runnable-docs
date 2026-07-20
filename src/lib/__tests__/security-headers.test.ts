import { describe, it, expect } from "vitest";
import nextConfig from "../../../next.config";

/**
 * Regression coverage for the baseline security headers. Prevents accidental
 * removal of the global clickjacking / base-uri / object-src protections.
 */
describe("next.config security headers", () => {
  it("applies baseline security headers to every route", async () => {
    expect(typeof nextConfig.headers).toBe("function");
    const rules = await nextConfig.headers!();
    const global = rules.find((r) => r.source === "/:path*");
    expect(global, "global header rule must exist").toBeTruthy();

    const keys = new Map(global!.headers.map((h) => [h.key, h.value]));
    const csp = keys.get("Content-Security-Policy") || "";
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(keys.get("X-Content-Type-Options")).toBe("nosniff");
    expect(keys.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(keys.get("Permissions-Policy")).toContain("camera=()");
  });

  it("keeps stricter no-store + noindex headers on admin routes", async () => {
    const rules = await nextConfig.headers!();
    const admin = rules.find((r) => r.source === "/admin/:path*");
    expect(admin).toBeTruthy();
    const keys = new Map(admin!.headers.map((h) => [h.key, h.value]));
    expect(keys.get("X-Frame-Options")).toBe("DENY");
    expect(keys.get("Cache-Control")).toContain("no-store");
  });
});
