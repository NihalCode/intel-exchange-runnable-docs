import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetDatabaseConnection, setTestDatabasePath } from "@/lib/db/client";
import { createUserFromInvite } from "@/lib/db/repository";
import { resetRateLimits } from "@/lib/documentation-auth/rate-limit";
import { isProtectedDocumentationPath } from "@/lib/documentation-auth/proxy-auth";
import { createApiKey, listApiKeyMetadata } from "@/lib/enterprise/api-keys";
import {
  checkStepUpAuthentication,
  hasPrivilegedMfa,
  hasRecentAuthentication,
} from "@/lib/enterprise/auth-assurance";
import { checkEnterpriseMutationRateLimit } from "@/lib/enterprise/rate-limit";
import {
  authorizeEnterprise,
  canBootstrapEnterpriseOrganization,
  enterprisePermissionsForPrincipal,
  mapEnterpriseRole,
} from "@/lib/enterprise/policy";
import {
  createControlPlaneResource,
  createMembership,
  createOrganization,
  findControlPlaneResource,
} from "@/lib/enterprise/repository";
import type { AppSession } from "@/lib/documentation-auth/session";
import type { EnterprisePrincipal } from "@/lib/enterprise/types";

function session(overrides: Partial<AppSession> = {}): AppSession {
  return {
    authProvider: "auth0",
    claims: {
      authTime: Math.floor(Date.now() / 1000),
      amr: ["pwd", "mfa"],
      acr: "urn:mfa",
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

describe("enterprise security scenarios", () => {
  describe("authorization matrix", () => {
    const owner: EnterprisePrincipal = {
      userId: "owner",
      organizationId: "org-a",
      role: "owner",
      status: "active",
    };
    const developer: EnterprisePrincipal = {
      userId: "developer",
      organizationId: "org-a",
      role: "developer",
      status: "active",
    };

    it("maps only owner, admin, and developer to enterprise roles", () => {
      expect(mapEnterpriseRole("owner")).toBe("owner");
      expect(mapEnterpriseRole("admin")).toBe("admin");
      expect(mapEnterpriseRole("developer")).toBe("developer");
      expect(mapEnterpriseRole("viewer")).toBeNull();
      expect(mapEnterpriseRole("documentation_manager")).toBeNull();
    });

    it("denies viewer and documentation_manager dashboard access", () => {
      const viewer: EnterprisePrincipal = {
        userId: "viewer",
        organizationId: "org-a",
        role: "viewer",
        status: "active",
      };
      expect(authorizeEnterprise(viewer, "admin_dashboard.access")).toBe(false);
      expect(
        authorizeEnterprise(
          { ...viewer, role: "documentation_manager" },
          "admin_dashboard.access"
        )
      ).toBe(false);
    });

    it("denies disabled principals and cross-tenant resource access", () => {
      expect(
        authorizeEnterprise(
          { ...owner, status: "disabled" },
          "admin_dashboard.access"
        )
      ).toBe(false);
      expect(
        authorizeEnterprise(owner, "resources.read", { organizationId: "org-b" })
      ).toBe(false);
    });

    it("allows owner production writes and developer staging writes only", () => {
      expect(
        authorizeEnterprise(owner, "resources.write", {
          organizationId: "org-a",
          environment: "production",
        })
      ).toBe(true);
      expect(
        authorizeEnterprise(developer, "resources.write", {
          organizationId: "org-a",
          environment: "staging",
        })
      ).toBe(true);
      expect(
        authorizeEnterprise(developer, "resources.write", {
          organizationId: "org-a",
          environment: "production",
        })
      ).toBe(false);
    });

    it("denies developer approval, credential management, and sensitive audit", () => {
      expect(authorizeEnterprise(developer, "changes.approve")).toBe(false);
      expect(authorizeEnterprise(developer, "credentials.manage")).toBe(false);
      expect(authorizeEnterprise(developer, "audit.read_sensitive")).toBe(false);
      expect(authorizeEnterprise(developer, "security_settings.manage")).toBe(
        false
      );
    });

    it("prevents developers from bootstrapping organizations", () => {
      expect(canBootstrapEnterpriseOrganization("developer")).toBe(false);
      expect(canBootstrapEnterpriseOrganization("owner")).toBe(true);
    });

    it("honors explicit permission revocations on principals", () => {
      const restricted = enterprisePermissionsForPrincipal({
        role: "owner",
        permissions: ["resources.read"],
      });
      expect(restricted).toEqual(["resources.read"]);
      expect(restricted).not.toContain("credentials.manage");
    });
  });

  describe("step-up authentication", () => {
    it("requires MFA claims for privileged Auth0 sessions", () => {
      const withoutMfa = session({
        claims: { authTime: Math.floor(Date.now() / 1000), amr: ["pwd"] },
      });
      expect(hasPrivilegedMfa(withoutMfa)).toBe(false);
      expect(
        checkStepUpAuthentication(withoutMfa, { requireMfa: true }).ok
      ).toBe(false);
      expect(hasPrivilegedMfa(session())).toBe(true);
      expect(checkStepUpAuthentication(session(), { requireMfa: true }).ok).toBe(
        true
      );
    });

    it("requires recent authentication for sensitive operations", () => {
      const stale = session({
        claims: {
          authTime: Math.floor(Date.now() / 1000) - 3600,
          amr: ["pwd", "mfa"],
        },
      });
      expect(hasRecentAuthentication(stale, 600)).toBe(false);
      expect(
        checkStepUpAuthentication(stale, { maxAuthAgeSeconds: 600 }).ok
      ).toBe(false);
    });

    it("treats missing authTime as recent so Auth0 sessions without auth_time still work", () => {
      const missing = session({
        claims: { amr: ["pwd", "mfa"] },
      });
      expect(hasRecentAuthentication(missing, 600)).toBe(true);
      expect(
        checkStepUpAuthentication(missing, {
          requireMfa: true,
          maxAuthAgeSeconds: 600,
        }).ok
      ).toBe(true);
    });

    it("allows disabled-auth dev sessions without MFA enforcement", () => {
      const dev = session({ authProvider: "disabled", claims: undefined });
      expect(checkStepUpAuthentication(dev, { requireMfa: true }).ok).toBe(
        true
      );
    });
  });

  describe("mutation rate limiting", () => {
    beforeEach(() => resetRateLimits());
    afterEach(() => resetRateLimits());

    it("allows bursts then returns false for the same org and user", () => {
      const org = "org-rate";
      const user = "user-rate";
      for (let i = 0; i < 30; i += 1) {
        expect(checkEnterpriseMutationRateLimit(org, user)).toBe(true);
      }
      expect(checkEnterpriseMutationRateLimit(org, user)).toBe(false);
    });
  });

  describe("proxy auth surface", () => {
    it("treats /admin pages as protected documentation paths", () => {
      expect(isProtectedDocumentationPath("/admin")).toBe(true);
      expect(
        isProtectedDocumentationPath("/admin/documentation-agent/apis")
      ).toBe(true);
      expect(isProtectedDocumentationPath("/api/admin/control-plane/context")).toBe(
        true
      );
      expect(isProtectedDocumentationPath("/sign-in")).toBe(false);
    });
  });

  describe("tenant isolation and secret exports", () => {
    let dbPath: string;
    let organizationId: string;
    let otherOrganizationId: string;
    let userId: string;

    beforeEach(async () => {
      dbPath = path.join(
        os.tmpdir(),
        `enterprise-security-${Date.now()}-${Math.random()}.db`
      );
      setTestDatabasePath(dbPath);
      resetDatabaseConnection();

      const user = await createUserFromInvite({
        auth0UserId: "auth0|security-user",
        email: "security@enterprise.test",
        role: "owner",
      });
      userId = user.id;
      const organization = await createOrganization({
        name: "Security Org",
        slug: `security-${Date.now()}`,
      });
      organizationId = organization.id;
      const other = await createOrganization({
        name: "Other Org",
        slug: `other-security-${Date.now()}`,
      });
      otherOrganizationId = other.id;
      await createMembership({
        organizationId,
        userId,
        role: "owner",
      });
    });

    afterEach(() => {
      resetDatabaseConnection();
      setTestDatabasePath(null);
      try {
        fs.unlinkSync(dbPath);
      } catch {
        // Ignore cleanup races on Windows.
      }
    });

    it("returns null for cross-organization resource lookups (non-enumerating)", async () => {
      const resource = await createControlPlaneResource({
        organizationId,
        resourceType: "docs-agent",
        name: "isolated",
        environment: "staging",
        createdByUserId: userId,
      });
      expect(
        await findControlPlaneResource(otherOrganizationId, resource.id)
      ).toBeNull();
    });

    it("never exposes key hashes or vault refs in credential metadata listings", async () => {
      const issued = await createApiKey({
        organizationId,
        name: "export-safe",
        environment: "staging",
        createdByUserId: userId,
      });
      const listed = await listApiKeyMetadata(organizationId);
      const serialized = JSON.stringify(listed);
      expect(serialized).not.toContain(issued.plaintext);
      expect(serialized).not.toContain("keyHash");
      expect(serialized).not.toContain("vaultRef");
      expect(listed[0]).toHaveProperty("last4");
    });
  });
});
