import { describe, expect, it, afterEach } from "vitest";

import {
  assertVectorNamespaceAccess,
  resolveVectorNamespace,
} from "@/lib/agent/vector-namespace";

const ORIG = { ...process.env };

afterEach(() => {
  process.env = { ...ORIG };
});

describe("resolveVectorNamespace", () => {
  it("uses VECTOR_NAMESPACE when set", () => {
    process.env.VECTOR_NAMESPACE = "tenant-a";
    expect(resolveVectorNamespace("cftr")).toBe("tenant-a");
  });

  it("derives namespace from APP_PRODUCT_ID", () => {
    delete process.env.VECTOR_NAMESPACE;
    process.env.APP_PRODUCT_ID = "ctix";
    expect(resolveVectorNamespace()).toBe("product-ctix");
  });

  it("derives namespace from productId when unpinned", () => {
    delete process.env.VECTOR_NAMESPACE;
    delete process.env.APP_PRODUCT_ID;
    expect(resolveVectorNamespace("orchestrate")).toBe("product-orchestrate");
  });
});

describe("assertVectorNamespaceAccess", () => {
  it("blocks cross-product queries on pinned deploys", () => {
    process.env.APP_PRODUCT_ID = "ctix";
    expect(() => assertVectorNamespaceAccess("cftr")).toThrow(/isolation/);
  });

  it("allows matching product on pinned deploy", () => {
    process.env.APP_PRODUCT_ID = "ctix";
    expect(assertVectorNamespaceAccess("ctix")).toBe("product-ctix");
  });
});
