import { describe, expect, it, beforeEach, afterEach } from "vitest";

import {
  assertProductAccess,
  effectiveDeploymentProductId,
  isSingleProductDeployment,
  resolveAppProductId,
} from "@/lib/deployment/resolve-app-product-id";
import { createFakeVercelProvider } from "@/lib/deployment/providers/fake-vercel-provider";
import { validateCollectionForProduct } from "@/lib/deployment/postman-collection-registry";

describe("resolveAppProductId", () => {
  afterEach(() => {
    delete process.env.APP_PRODUCT_ID;
  });

  it("returns null when unset", () => {
    expect(resolveAppProductId()).toBeNull();
    expect(isSingleProductDeployment()).toBe(false);
  });

  it("pins deployment to valid product", () => {
    process.env.APP_PRODUCT_ID = "cftr";
    expect(resolveAppProductId()).toBe("cftr");
    expect(effectiveDeploymentProductId()).toBe("cftr");
    expect(isSingleProductDeployment()).toBe(true);
  });

  it("assertProductAccess rejects wrong product on pinned deploy", () => {
    process.env.APP_PRODUCT_ID = "ctix";
    expect(assertProductAccess("ctix")).toBe("ctix");
    expect(() => assertProductAccess("cftr")).toThrow(/not served/);
  });
});

describe("postman collection registry", () => {
  it("validates cftr collection id", () => {
    expect(validateCollectionForProduct("cftr", "4787352")).toBe(true);
    expect(validateCollectionForProduct("cftr", "wrong")).toBe(false);
  });
});

describe("fake Vercel provider", () => {
  it("adds and verifies domains", async () => {
    const provider = createFakeVercelProvider();
    const added = await provider.addDomain("prj_ctix", "docs.example.com");
    expect(added.verified).toBe(false);
    const verified = await provider.verifyDomain("prj_ctix", "docs.example.com");
    expect(verified.verified).toBe(true);
    expect(verified.ssl?.status).toBe("active");
  });
});
