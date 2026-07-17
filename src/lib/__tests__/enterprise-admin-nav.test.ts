import { describe, expect, it } from "vitest";

import { canAccessEnterpriseAdminNav } from "@/lib/documentation-auth/permissions";

describe("canAccessEnterpriseAdminNav", () => {
  it("allows owner, admin, and developer", () => {
    expect(canAccessEnterpriseAdminNav("owner")).toBe(true);
    expect(canAccessEnterpriseAdminNav("admin")).toBe(true);
    expect(canAccessEnterpriseAdminNav("developer")).toBe(true);
  });

  it("denies viewer and documentation_manager", () => {
    expect(canAccessEnterpriseAdminNav("viewer")).toBe(false);
    expect(canAccessEnterpriseAdminNav("documentation_manager")).toBe(false);
  });
});
