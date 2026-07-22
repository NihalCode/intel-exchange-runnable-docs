import { describe, expect, it } from "vitest";

import {
  canAccessEnterpriseAdminNav,
  hasPermission,
  permissionsForRole,
} from "@/lib/documentation-auth/permissions";
import {
  authorizeEnterprise,
  mapEnterpriseRole,
} from "@/lib/enterprise/policy";
import type { EnterprisePrincipal } from "@/lib/enterprise/types";
import {
  adminMfaStepUpHref,
  auth0LogoutToOriginPath,
  auth0StepUpLoginPath,
} from "@/lib/enterprise/mfa-step-up";
import { auth0LoginPath } from "@/lib/documentation-auth/sign-in-url";

function principal(
  role: string,
  overrides: Partial<EnterprisePrincipal> = {}
): EnterprisePrincipal {
  return {
    userId: "u1",
    organizationId: "o1",
    role,
    status: "active",
    permissions: [],
    ...overrides,
  };
}

describe("role-based filtering (workspace + enterprise)", () => {
  it("maps only owner/admin/developer into enterprise admin roles", () => {
    expect(mapEnterpriseRole("owner")).toBe("owner");
    expect(mapEnterpriseRole("admin")).toBe("admin");
    expect(mapEnterpriseRole("developer")).toBe("developer");
    expect(mapEnterpriseRole("viewer")).toBeNull();
    expect(mapEnterpriseRole("documentation_manager")).toBeNull();
  });

  it("admin nav visibility matches enterprise-capable workspace roles", () => {
    expect(canAccessEnterpriseAdminNav("owner")).toBe(true);
    expect(canAccessEnterpriseAdminNav("admin")).toBe(true);
    expect(canAccessEnterpriseAdminNav("developer")).toBe(true);
    expect(canAccessEnterpriseAdminNav("viewer")).toBe(false);
    expect(canAccessEnterpriseAdminNav("documentation_manager")).toBe(false);
  });

  it("viewer can ask agent and read docs but not manage users/sources", () => {
    expect(hasPermission("viewer", "ask_agent")).toBe(true);
    expect(hasPermission("viewer", "read_docs")).toBe(true);
    expect(hasPermission("viewer", "manage_users")).toBe(false);
    expect(hasPermission("viewer", "manage_sources")).toBe(false);
    expect(permissionsForRole("viewer")).toEqual(["read_docs", "ask_agent"]);
  });

  it("documentation_manager can sync/sources but not manage users", () => {
    expect(hasPermission("documentation_manager", "sync_docs")).toBe(true);
    expect(hasPermission("documentation_manager", "manage_sources")).toBe(true);
    expect(hasPermission("documentation_manager", "manage_users")).toBe(false);
    expect(authorizeEnterprise(principal("documentation_manager"), "admin_dashboard.access")).toBe(
      false
    );
  });

  it("developer can open admin dashboard but cannot manage features/credentials", () => {
    expect(authorizeEnterprise(principal("developer"), "admin_dashboard.access")).toBe(true);
    expect(authorizeEnterprise(principal("developer"), "features.manage")).toBe(false);
    expect(authorizeEnterprise(principal("developer"), "credentials.manage")).toBe(false);
    expect(authorizeEnterprise(principal("admin"), "features.manage")).toBe(true);
    expect(authorizeEnterprise(principal("owner"), "credentials.manage")).toBe(true);
  });

  it("inactive principals are denied even with admin role", () => {
    expect(
      authorizeEnterprise(principal("admin", { status: "disabled" }), "admin_dashboard.access")
    ).toBe(false);
  });
});

describe("one-time login vs one-time MFA (path contracts)", () => {
  it("silent product login never re-prompts MFA", () => {
    for (const path of ["/", "/agent", "/docs/ping", "/authentication"]) {
      const url = auth0LoginPath(path);
      expect(url.startsWith("/auth/login?")).toBe(true);
      expect(url).not.toContain("prompt=");
      expect(url).not.toContain("max_age=");
      expect(url).not.toContain("acr_values=");
    }
  });

  it("admin MFA step-up always logs out then forces re-auth", () => {
    const href = adminMfaStepUpHref("/admin");
    expect(href.startsWith("/access/mfa-step-up?returnTo=")).toBe(true);
    const logout = auth0LogoutToOriginPath("https://cyware-docs-orchestrate.vercel.app");
    expect(logout.startsWith("/auth/logout?returnTo=")).toBe(true);
    const origin = decodeURIComponent(logout.split("returnTo=")[1]!);
    expect(origin).toBe("https://cyware-docs-orchestrate.vercel.app");
    expect(auth0StepUpLoginPath("/admin")).toContain("prompt=login");
    expect(auth0StepUpLoginPath("/admin")).toContain("max_age=0");
  });
});
