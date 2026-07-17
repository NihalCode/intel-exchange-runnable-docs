import { describe, expect, it, afterEach } from "vitest";

import { matchStaticDomainHostname } from "@/lib/domains/env-config";
import {
  hasConfiguredAdminDomain,
  isSeparateAdminDomainEnabled,
} from "@/lib/domains/feature-gates";
import { isAdminPathOnProductHost } from "@/lib/domains/route-rewrite";

const ORIG = { ...process.env };

afterEach(() => {
  process.env = { ...ORIG };
});

describe("matchStaticDomainHostname (pinned deployment)", () => {
  it("maps VERCEL_URL to APP_PRODUCT_ID without CSAP_DOMAIN", () => {
    process.env.APP_PRODUCT_ID = "csap";
    process.env.VERCEL_URL = "cyware-docs-csap.vercel.app";
    const match = matchStaticDomainHostname("cyware-docs-csap.vercel.app");
    expect(match?.kind).toBe("product");
    expect(match?.productId).toBe("csap");
  });

  it("maps APP_BASE_URL host to pinned product", () => {
    process.env.APP_PRODUCT_ID = "cftr";
    process.env.APP_BASE_URL = "https://cyware-docs-cftr.vercel.app";
    const match = matchStaticDomainHostname("cyware-docs-cftr.vercel.app");
    expect(match?.productId).toBe("cftr");
  });
});

describe("admin on product hosts", () => {
  it("recognizes admin paths", () => {
    expect(isAdminPathOnProductHost("/admin")).toBe(true);
    expect(isAdminPathOnProductHost("/admin/documentation-agent/deployments")).toBe(true);
  });

  it("separate admin domain requires explicit env and ADMIN_DOMAIN", () => {
    delete process.env.SEPARATE_ADMIN_DOMAIN_ENABLED;
    delete process.env.ADMIN_DOMAIN;
    process.env.DOMAIN_ROUTING_ENABLED = "true";
    expect(isSeparateAdminDomainEnabled()).toBe(false);
    expect(hasConfiguredAdminDomain()).toBe(false);
  });

  it("separate admin only when SEPARATE_ADMIN_DOMAIN_ENABLED and ADMIN_DOMAIN set", () => {
    process.env.SEPARATE_ADMIN_DOMAIN_ENABLED = "true";
    process.env.ADMIN_DOMAIN = "admin.example.com";
    expect(isSeparateAdminDomainEnabled()).toBe(true);
    expect(hasConfiguredAdminDomain()).toBe(true);
  });
});
