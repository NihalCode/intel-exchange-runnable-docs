import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppSession } from "@/lib/documentation-auth/session";
import {
  adminLayoutRequiresMfa,
  evaluateAdminAccess,
} from "@/lib/enterprise/admin-access";
import type { OrganizationContext } from "@/lib/enterprise/types";

const resolveOrganizationContextOrBootstrap = vi.fn();

vi.mock("@/lib/enterprise/organization-context", () => ({
  OrganizationContextError: class OrganizationContextError extends Error {
    status = 403;
  },
  resolveOrganizationContextOrBootstrap: (...args: unknown[]) =>
    resolveOrganizationContextOrBootstrap(...args),
}));

function session(overrides: Partial<AppSession> = {}): AppSession {
  return {
    authProvider: "auth0",
    claims: {
      authTime: Math.floor(Date.now() / 1000),
      amr: ["pwd"],
    },
    user: {
      id: "user-1",
      auth0UserId: "auth0|user-1",
      email: "owner@enterprise.test",
      name: "Owner",
      role: "owner",
      status: "active",
    },
    ...overrides,
  };
}

function organizationContext(
  overrides: Partial<OrganizationContext> = {}
): OrganizationContext {
  return {
    organization: {
      id: "org-1",
      auth0OrganizationId: null,
      slug: "default-org",
      name: "Default Organization",
      status: "active",
    },
    membership: {
      id: "membership-1",
      userId: "user-1",
      organizationId: "org-1",
      role: "owner",
      status: "active",
      permissions: [],
    },
    principal: {
      userId: "user-1",
      organizationId: "org-1",
      role: "owner",
      status: "active",
      permissions: [],
    },
    ...overrides,
  };
}

describe("adminLayoutRequiresMfa", () => {
  const original = process.env.ADMIN_REQUIRE_MFA;

  afterEach(() => {
    if (original === undefined) delete process.env.ADMIN_REQUIRE_MFA;
    else process.env.ADMIN_REQUIRE_MFA = original;
  });

  it("is false unless ADMIN_REQUIRE_MFA=true", () => {
    delete process.env.ADMIN_REQUIRE_MFA;
    expect(adminLayoutRequiresMfa()).toBe(false);
    process.env.ADMIN_REQUIRE_MFA = "false";
    expect(adminLayoutRequiresMfa()).toBe(false);
    process.env.ADMIN_REQUIRE_MFA = "true";
    expect(adminLayoutRequiresMfa()).toBe(true);
  });
});

describe("evaluateAdminAccess", () => {
  const originalMfaEnv = process.env.ADMIN_REQUIRE_MFA;

  beforeEach(() => {
    resolveOrganizationContextOrBootstrap.mockReset();
    delete process.env.ADMIN_REQUIRE_MFA;
  });

  afterEach(() => {
    if (originalMfaEnv === undefined) delete process.env.ADMIN_REQUIRE_MFA;
    else process.env.ADMIN_REQUIRE_MFA = originalMfaEnv;
  });

  it("denies null sessions", async () => {
    const result = await evaluateAdminAccess(null);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("no_session");
  });

  it("allows owner without MFA claims by default", async () => {
    resolveOrganizationContextOrBootstrap.mockResolvedValue(organizationContext());
    const result = await evaluateAdminAccess(session());
    expect(result.allowed).toBe(true);
    expect(result.organizationContext?.organization.id).toBe("org-1");
  });

  it("denies owner without MFA when ADMIN_REQUIRE_MFA=true", async () => {
    process.env.ADMIN_REQUIRE_MFA = "true";
    resolveOrganizationContextOrBootstrap.mockResolvedValue(organizationContext());
    const result = await evaluateAdminAccess(session());
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("mfa_required");
  });

  it("allows owner with MFA when ADMIN_REQUIRE_MFA=true", async () => {
    process.env.ADMIN_REQUIRE_MFA = "true";
    resolveOrganizationContextOrBootstrap.mockResolvedValue(organizationContext());
    const result = await evaluateAdminAccess(
      session({
        claims: {
          authTime: Math.floor(Date.now() / 1000),
          amr: ["pwd", "mfa"],
          acr: "urn:mfa",
        },
      })
    );
    expect(result.allowed).toBe(true);
  });

  it("denies inactive principals", async () => {
    resolveOrganizationContextOrBootstrap.mockResolvedValue(
      organizationContext({
        principal: {
          userId: "user-1",
          organizationId: "org-1",
          role: "owner",
          status: "disabled",
          permissions: [],
        },
        membership: {
          id: "membership-1",
          userId: "user-1",
          organizationId: "org-1",
          role: "owner",
          status: "disabled",
          permissions: [],
        },
      })
    );
    const result = await evaluateAdminAccess(session());
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("inactive_principal");
  });

  it("denies viewers even without MFA enforcement", async () => {
    resolveOrganizationContextOrBootstrap.mockResolvedValue(
      organizationContext({
        principal: {
          userId: "user-1",
          organizationId: "org-1",
          role: "viewer",
          status: "active",
          permissions: [],
        },
        membership: {
          id: "membership-1",
          userId: "user-1",
          organizationId: "org-1",
          role: "viewer",
          status: "active",
          permissions: [],
        },
      })
    );
    const result = await evaluateAdminAccess(
      session({ user: { ...session().user, role: "viewer" } })
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("missing_permission");
  });
});
