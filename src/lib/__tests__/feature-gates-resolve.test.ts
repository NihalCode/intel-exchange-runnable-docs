import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/documentation-features", () => ({
  isDocumentationFeatureEnabled: vi.fn(),
}));

import { isDocumentationFeatureEnabled } from "@/lib/documentation-features";
import {
  resolveQueryAnalyticsEnabled,
  resolveDomainRoutingEnabled,
} from "@/lib/domains/feature-gates-resolve";

describe("feature-gates-resolve", () => {
  beforeEach(() => {
    vi.mocked(isDocumentationFeatureEnabled).mockReset();
    delete process.env.QUERY_ANALYTICS_ENABLED;
    delete process.env.DOMAIN_ROUTING_ENABLED;
  });

  it("prefers env flag when set", async () => {
    process.env.QUERY_ANALYTICS_ENABLED = "true";
    await expect(
      resolveQueryAnalyticsEnabled({ organizationId: "org-1" })
    ).resolves.toBe(true);
    expect(isDocumentationFeatureEnabled).not.toHaveBeenCalled();
  });

  it("falls back to org feature flag", async () => {
    vi.mocked(isDocumentationFeatureEnabled).mockResolvedValue(true);
    await expect(
      resolveQueryAnalyticsEnabled({ organizationId: "org-1", role: "admin" })
    ).resolves.toBe(true);
    expect(isDocumentationFeatureEnabled).toHaveBeenCalledWith({
      organizationId: "org-1",
      key: "query_analytics",
      role: "admin",
      environment: undefined,
    });
  });

  it("domain routing proxy gate is env-only", () => {
    expect(resolveDomainRoutingEnabled()).toBe(false);
    process.env.DOMAIN_ROUTING_ENABLED = "true";
    expect(resolveDomainRoutingEnabled()).toBe(true);
  });
});
