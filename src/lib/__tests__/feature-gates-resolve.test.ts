import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/documentation-features/resolve-enabled", () => ({
  resolveDocumentationFeatureEnabled: vi.fn(),
}));

import { resolveDocumentationFeatureEnabled } from "@/lib/documentation-features/resolve-enabled";
import {
  resolveQueryAnalyticsEnabled,
  resolveDomainRoutingEnabled,
} from "@/lib/domains/feature-gates-resolve";

describe("feature-gates-resolve", () => {
  beforeEach(() => {
    vi.mocked(resolveDocumentationFeatureEnabled).mockReset();
    delete process.env.QUERY_ANALYTICS_ENABLED;
    delete process.env.DOMAIN_ROUTING_ENABLED;
  });

  it("prefers env flag when set", async () => {
    process.env.QUERY_ANALYTICS_ENABLED = "true";
    await expect(
      resolveQueryAnalyticsEnabled({ organizationId: "org-1" })
    ).resolves.toBe(true);
    expect(resolveDocumentationFeatureEnabled).not.toHaveBeenCalled();
  });

  it("falls back to resolved org/topology feature flag", async () => {
    vi.mocked(resolveDocumentationFeatureEnabled).mockResolvedValue(true);
    await expect(
      resolveQueryAnalyticsEnabled({ organizationId: "org-1", role: "admin" })
    ).resolves.toBe(true);
    expect(resolveDocumentationFeatureEnabled).toHaveBeenCalledWith({
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
