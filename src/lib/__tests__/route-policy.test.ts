import { describe, expect, it } from "vitest";

import {
  isAnonymousHubPath,
  isAnonymousViewerPath,
  isProtectedPath,
  isPublicApiPath,
  isPublicPagePath,
} from "@/lib/documentation-auth/route-policy";

describe("documentation route policy — anonymous viewer + gated admin", () => {
  it("allows anonymous viewer pages without Auth0", () => {
    for (const pathname of [
      "/",
      "/docs",
      "/docs/ctix/indicators",
      "/guides",
      "/changelog",
      "/agent",
    ]) {
      expect(isPublicPagePath(pathname)).toBe(true);
      expect(isAnonymousViewerPath(pathname)).toBe(true);
      expect(isProtectedPath(pathname)).toBe(false);
    }
  });

  it("keeps authentication, settings, admin, and developer gated", () => {
    for (const pathname of [
      "/authentication",
      "/settings",
      "/settings/users",
      "/admin",
      "/developer",
    ]) {
      expect(isPublicPagePath(pathname)).toBe(false);
      expect(isProtectedPath(pathname)).toBe(true);
    }
  });

  it("marks anonymous viewer paths for client auth provider", () => {
    expect(isAnonymousHubPath("/")).toBe(true);
    expect(isAnonymousViewerPath("/agent")).toBe(true);
    expect(isAnonymousViewerPath("/docs/ctix")).toBe(true);
    expect(isAnonymousViewerPath("/access/wrong-email")).toBe(false);
  });

  it("allows authentication UX paths", () => {
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

  it("allows health, auth probes, CSRF, Ask AI chat, docs search, and product metadata", () => {
    for (const pathname of [
      "/api/auth/invite-check",
      "/api/auth/session",
      "/api/auth/me",
      "/api/auth/csrf",
      "/api/auth/okta-signup",
      "/api/invites/validate",
      "/api/health/live",
      "/api/health/ready",
      "/api/docs/search",
      "/api/products",
      "/api/products/ctix",
      "/api/agent",
    ]) {
      expect(isPublicApiPath(pathname)).toBe(true);
      expect(isProtectedPath(pathname)).toBe(false);
    }
  });

  it("protects credential, run, admin, and agent mutation APIs", () => {
    for (const pathname of [
      "/api/run",
      "/api/authentication/credentials",
      "/api/authentication/credentials/session",
      "/api/admin/control-plane/context",
      "/api/agent/commit",
      "/api/agent/deploy",
      "/api/agent/conversations",
      "/api/products/ctix/ingest",
    ]) {
      expect(isPublicApiPath(pathname)).toBe(false);
      expect(isProtectedPath(pathname)).toBe(true);
    }
  });
});
