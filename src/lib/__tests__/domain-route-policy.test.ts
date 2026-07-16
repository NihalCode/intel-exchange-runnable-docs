import { describe, expect, it } from "vitest";

import { productHostDocsRewrite } from "@/lib/domains/route-rewrite";

describe("productHostDocsRewrite", () => {
  const ctx = {
    hostname: "ctix.example.com",
    organizationId: "org",
    domainKind: "product" as const,
    productId: "ctix" as const,
    collectionId: "ctix",
    environment: "production" as const,
    mappingId: "map",
    fromEnvConfig: true,
  };

  it("rewrites /docs to /docs/ctix", () => {
    expect(productHostDocsRewrite("/docs", ctx)).toBe("/docs/ctix");
  });

  it("flags cross-product paths", () => {
    expect(productHostDocsRewrite("/docs/cftr", ctx)).toBe("__CROSS_PRODUCT_MISMATCH__");
  });
});
