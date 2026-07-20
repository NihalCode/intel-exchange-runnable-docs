import { describe, expect, it } from "vitest";

import { authorizeEnterprise, enterprisePermissionsForPrincipal } from "@/lib/enterprise/policy";
import {
  ENTERPRISE_PERMISSIONS,
  type EnterprisePermission,
  type EnterprisePrincipal,
} from "@/lib/enterprise/types";

function principal(
  role: string,
  overrides: Partial<EnterprisePrincipal> = {}
): EnterprisePrincipal {
  return {
    userId: `${role}-user`,
    organizationId: "org-a",
    role,
    status: "active",
    ...overrides,
  };
}

const DEVELOPER_DENIED: EnterprisePermission[] = [
  "changes.approve",
  "security_settings.manage",
  "audit.read_sensitive",
  "credentials.manage",
  "features.manage",
  "schemas.review",
  "schemas.publish",
  "resources.write_production",
  "domains.manage",
  "deployments.manage",
  "collections.manage",
  "query_analytics.read_sensitive",
  "unanswered_queries.manage",
];

describe("enterprise authz policy decision coverage", () => {
  it("covers every ENTERPRISE_PERMISSION for owner (allow)", () => {
    const owner = principal("owner");
    for (const permission of ENTERPRISE_PERMISSIONS) {
      expect(
        authorizeEnterprise(owner, permission, { organizationId: "org-a" }),
        permission
      ).toBe(true);
    }
  });

  it("covers every ENTERPRISE_PERMISSION for admin (allow)", () => {
    const admin = principal("admin");
    for (const permission of ENTERPRISE_PERMISSIONS) {
      expect(
        authorizeEnterprise(admin, permission, { organizationId: "org-a" }),
        permission
      ).toBe(true);
    }
  });

  it("covers every ENTERPRISE_PERMISSION for developer (allow/deny matrix)", () => {
    const developer = principal("developer");
    const allowed = new Set(enterprisePermissionsForPrincipal(developer));
    for (const permission of ENTERPRISE_PERMISSIONS) {
      const expected =
        allowed.has(permission) && !DEVELOPER_DENIED.includes(permission);
      expect(
        authorizeEnterprise(developer, permission, { organizationId: "org-a" }),
        permission
      ).toBe(expected);
    }
  });

  it("denies every ENTERPRISE_PERMISSION for viewer and documentation_manager", () => {
    for (const role of ["viewer", "documentation_manager"] as const) {
      const p = principal(role);
      for (const permission of ENTERPRISE_PERMISSIONS) {
        expect(authorizeEnterprise(p, permission), `${role}:${permission}`).toBe(false);
      }
    }
  });

  it("denies every permission when status is not active", () => {
    for (const status of ["disabled", "pending"] as const) {
      const p = principal("owner", { status });
      for (const permission of ENTERPRISE_PERMISSIONS) {
        expect(authorizeEnterprise(p, permission), `${status}:${permission}`).toBe(false);
      }
    }
  });

  it("denies every permission on cross-tenant resource", () => {
    const owner = principal("owner");
    for (const permission of ENTERPRISE_PERMISSIONS) {
      expect(
        authorizeEnterprise(owner, permission, { organizationId: "org-other" }),
        permission
      ).toBe(false);
    }
  });

  it("developer cannot write production for any write-class permission", () => {
    const developer = principal("developer");
    expect(
      authorizeEnterprise(developer, "resources.write", {
        organizationId: "org-a",
        environment: "production",
      })
    ).toBe(false);
    expect(
      authorizeEnterprise(developer, "resources.read", {
        organizationId: "org-a",
        environment: "production",
      })
    ).toBe(true);
  });
});
