import { describe, expect, it } from "vitest";

import {
  isAnonymousHubPath,
  isProtectedPath,
  isPublicApiPath,
  isPublicPagePath,
} from "@/lib/documentation-auth/route-policy";

describe("documentation route policy — Auth0-gated app", () => {
  it("protects documentation and application pages", () => {
    for (const pathname of [
      "/",
      "/docs",
      "/docs/ctix/indicators",
      "/guides",
      "/changelog",
      "/agent",
      "/authentication",
      "/settings",
      "/admin",
      "/developer",
    ]) {
      expect(isPublicPagePath(pathname)).toBe(false);
      expect(isProtectedPath(pathname)).toBe(true);
    }
  });

  it("marks only the product hub as anonymously browsable", () => {
    expect(isAnonymousHubPath("/")).toBe(true);
    expect(isAnonymousHubPath("")).toBe(true);
    expect(isAnonymousHubPath("/docs")).toBe(false);
    expect(isAnonymousHubPath("/access/wrong-email")).toBe(false);
  });

  it("allows authentication UX paths only", () => {
    for (const pathname of [
      "/auth",
      "/auth/callback",
      "/sign-in",
      "/sign-up",
      "/access/invite-required",
      "/invite",
      "/post-login",
    ]) {
      expect(isPublicPagePath(pathname)).toBe(true);
      expect(isProtectedPath(pathname)).toBe(false);
    }
  });

  it("allows only health and auth probe APIs", () => {
    for (const pathname of [
      "/api/auth/invite-check",
      "/api/auth/session",
      "/api/auth/me",
      "/api/auth/okta-signup",
      "/api/invites/validate",
      "/api/health/live",
      "/api/health/ready",
    ]) {
      expect(isPublicApiPath(pathname)).toBe(true);
      expect(isProtectedPath(pathname)).toBe(false);
    }
  });

  it("protects product, search, agent, and execution APIs", () => {
    for (const pathname of [
      "/api/products",
      "/api/products/ctix",
      "/api/docs/search",
      "/api/agent",
      "/api/run",
      "/api/authentication/credentials",
      "/api/authentication/credentials/session",
      "/api/admin/control-plane/context",
    ]) {
      expect(isPublicApiPath(pathname)).toBe(false);
      expect(isProtectedPath(pathname)).toBe(true);
    }
  });
});
