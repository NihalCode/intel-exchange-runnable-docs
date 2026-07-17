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

  it("pinned deploy filters product list to one product", async () => {
    process.env.APP_PRODUCT_ID = "ctix";
    const { listProducts } = await import("@/lib/products/registry");
    const pinned = resolveAppProductId();
    const products = listProducts().filter((p) => !pinned || p.productId === pinned);
    expect(products.map((p) => p.productId)).toEqual(["ctix"]);
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

  it("promotes and rollbacks deployments", async () => {
    const provider = createFakeVercelProvider();
    const deployments = await provider.listDeployments("prj_ctix");
    const promoted = await provider.promoteDeployment(deployments[0]!.id);
    expect(promoted.state).toBe("READY");
    const rolledBack = await provider.rollbackDeployment("prj_ctix");
    expect(rolledBack.id).toBe(deployments[1]!.id);
  });
});
