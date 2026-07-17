import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppSession } from "@/lib/documentation-auth/session";

const getAppSessionResult = vi.fn();
const resolveOrganizationContextOrBootstrap = vi.fn();

vi.mock("@/lib/documentation-auth/session", () => ({
  getAppSessionResult: (...args: unknown[]) => getAppSessionResult(...args),
}));

vi.mock("@/lib/enterprise/organization-context", () => ({
  resolveOrganizationContextOrBootstrap: (...args: unknown[]) =>
    resolveOrganizationContextOrBootstrap(...args),
}));

import { resolveWorkspaceSession } from "@/lib/documentation-auth/workspace-session";

function session(): AppSession {
  return {
    authProvider: "auth0",
    user: {
      id: "user-1",
      auth0UserId: "auth0|user-1",
      email: "owner@enterprise.test",
      name: "Owner",
      role: "owner",
      status: "active",
    },
  };
}

describe("resolveWorkspaceSession", () => {
  beforeEach(() => {
    getAppSessionResult.mockReset();
    resolveOrganizationContextOrBootstrap.mockReset();
  });

  it("preserves the authenticated session when organization resolution fails", async () => {
    getAppSessionResult.mockResolvedValue({
      session: session(),
      auth0Authenticated: true,
    });
    resolveOrganizationContextOrBootstrap.mockRejectedValue(new Error("db down"));

    const result = await resolveWorkspaceSession();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.result.session?.user.role).toBe("owner");
    expect(result.result.auth0Authenticated).toBe(true);
  });

  it("returns enterprise capabilities when organization context resolves", async () => {
    getAppSessionResult.mockResolvedValue({
      session: session(),
      auth0Authenticated: true,
    });
    resolveOrganizationContextOrBootstrap.mockResolvedValue({
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
    });

    const result = await resolveWorkspaceSession();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workspace.enterpriseCapabilities).toContain("admin_dashboard.access");
  });
});
