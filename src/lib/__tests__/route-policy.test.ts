import { describe, expect, it } from "vitest";

import {
  isProtectedPath,
  isPublicApiPath,
  isPublicPagePath,
} from "@/lib/documentation-auth/route-policy";

describe("documentation route policy", () => {
  it("allows the root exactly and public documentation page prefixes", () => {
    for (const pathname of [
      "/",
      "/docs",
      "/docs/",
      "/docs/ctix/indicators",
      "/guides",
      "/guides/",
      "/guides/authentication",
      "/changelog",
      "/changelog/",
      "/changelog/2026-07",
    ]) {
      expect(isPublicPagePath(pathname)).toBe(true);
      expect(isProtectedPath(pathname)).toBe(false);
    }
  });

  it("allows existing authentication UX paths", () => {
    for (const pathname of [
      "/auth",
      "/auth/callback",
      "/sign-in",
      "/access/invite-required",
      "/invite",
      "/post-login",
    ]) {
      expect(isPublicPagePath(pathname)).toBe(true);
    }
  });

  it("does not treat root or public prefixes as partial matches", () => {
    for (const pathname of ["/documentation", "/docs-v2", "/guides-old", "/changelogger"]) {
      expect(isPublicPagePath(pathname)).toBe(false);
      expect(isProtectedPath(pathname)).toBe(true);
    }
  });

  it("allows only the documented public API endpoints", () => {
    for (const pathname of [
      "/api/auth/invite-check",
      "/api/auth/session",
      "/api/auth/me",
      "/api/invites/validate",
      "/api/health/live",
      "/api/health/ready",
      "/api/products",
      "/api/products/ctix",
      "/api/docs/search",
    ]) {
      expect(isPublicApiPath(pathname)).toBe(true);
      expect(isProtectedPath(pathname)).toBe(false);
    }
  });

  it("keeps query-less protected application and side-effect API paths private", () => {
    for (const pathname of [
      "/agent",
      "/authentication",
      "/settings",
      "/settings/profile",
      "/admin",
      "/admin/users",
      "/developer",
      "/api/agent",
      "/api/agent/plan",
      "/api/run",
      "/api/admin/users",
      "/api/authentication/credentials",
      "/api/users",
      "/api/developer/diagnostics",
    ]) {
      expect(isProtectedPath(pathname)).toBe(true);
    }
  });

  it("requires exact matches for public API endpoints", () => {
    for (const pathname of ["/api/docs/search/", "/api/health/liveness", "/api/products-v2"]) {
      expect(isPublicApiPath(pathname)).toBe(false);
      expect(isProtectedPath(pathname)).toBe(true);
    }
  });
});
