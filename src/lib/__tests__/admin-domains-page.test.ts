import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("admin Domains page availability", () => {
  it("does not hard-404 behind host_based_product_routing requireAdminFeature", () => {
    const page = readFileSync(
      path.join(process.cwd(), "src/app/admin/documentation-agent/domains/page.tsx"),
      "utf8"
    );
    expect(page).toContain("domains.read");
    expect(page).toContain("listDomainMappings");
    expect(page).not.toMatch(/requireAdminFeature\([^)]*host_based_product_routing/);
    expect(page).toContain("routingEnabled");
  });

  it("surfaces a routing-disabled banner in the Domains UI", () => {
    const ui = readFileSync(
      path.join(
        process.cwd(),
        "src/components/admin/pages/DocumentationAgentDomainsPage.tsx"
      ),
      "utf8"
    );
    expect(ui).toContain("domains-routing-disabled-banner");
    expect(ui).toContain("admin-domains-page");
  });
});
