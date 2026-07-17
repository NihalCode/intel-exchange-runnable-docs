import { describe, expect, it, afterEach } from "vitest";

import { resolveDocumentationFeatureEnabled } from "@/lib/documentation-features/resolve-enabled";

const ORIG = { ...process.env };

afterEach(() => {
  process.env = { ...ORIG };
});

describe("resolveDocumentationFeatureEnabled (pinned deploy)", () => {
  it("enables host routing and deployment admin features when APP_PRODUCT_ID is set", async () => {
    process.env.APP_PRODUCT_ID = "csap";
    await expect(
      resolveDocumentationFeatureEnabled({
        organizationId: "org-1",
        key: "host_based_product_routing",
      })
    ).resolves.toBe(true);
    await expect(
      resolveDocumentationFeatureEnabled({
        organizationId: "org-1",
        key: "admin_deployment_management",
      })
    ).resolves.toBe(true);
    await expect(
      resolveDocumentationFeatureEnabled({
        organizationId: "org-1",
        key: "query_analytics",
      })
    ).resolves.toBe(true);
  });
});
