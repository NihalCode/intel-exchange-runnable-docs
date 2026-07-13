import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveProductScope } from "@/lib/agent/product-scope";
import { enforceCatalogPlan } from "@/lib/agent/planner";
import { runAgent } from "@/lib/agent/orchestrate";
import {
  buildProductAccessDeniedResponse,
  buildProductClarificationQuestions,
} from "@/lib/documentation-credentials/access";
import {
  resetDatabaseConnection,
  setTestDatabasePath,
} from "@/lib/db/client";
import { createUserFromInvite } from "@/lib/db/repository";
import {
  createMembership,
  createOrganization,
} from "@/lib/enterprise/repository";
import {
  listValidCredentialProductIds,
  upsertCredential,
} from "@/lib/documentation-credentials/repository";
import {
  clampAgentProductId,
  quickStartsForProducts,
} from "@/components/AgentProductAccess";
import { inferProductsFromQuery } from "@/lib/products/registry";

describe("resolveProductScope credential allowlist", () => {
  it("allows CTIX-only access when only CTIX is connected", () => {
    const scope = resolveProductScope(
      { query: "list indicators", productId: "ctix" },
      "list indicators",
      { allowedProductIds: ["ctix"] }
    );
    expect(scope.accessViolation).toBeUndefined();
    expect(scope.primaryProductId).toBe("ctix");
    expect(scope.productIds).toEqual(["ctix"]);
  });

  it("denies CFTR questions when only CTIX is connected", () => {
    const scope = resolveProductScope(
      { query: "CFTR: list incidents", productId: "ctix" },
      "CFTR: list incidents",
      { allowedProductIds: ["ctix"] }
    );
    expect(scope.accessViolation).toEqual({
      deniedProductIds: ["cftr"],
      allowedProductIds: ["ctix"],
    });
  });

  it("denies mixed-product questions when user lacks one credential", () => {
    const scope = resolveProductScope(
      { query: "Compare CTIX indicators with Orchestrate playbooks", productId: "ctix" },
      "Compare CTIX indicators with Orchestrate playbooks",
      { allowedProductIds: ["ctix", "cftr"] }
    );
    expect(scope.accessViolation?.deniedProductIds).toEqual(["orchestrate"]);
    expect(scope.accessViolation?.allowedProductIds).toEqual(["ctix", "cftr"]);
  });

  it("scopes search-all to connected products only", () => {
    const scope = resolveProductScope(
      { query: "search all Cyware APIs for connectivity", productId: "all" },
      "search all Cyware APIs for connectivity",
      { allowedProductIds: ["csap", "cftr"] }
    );
    expect(scope.accessViolation).toBeUndefined();
    expect(scope.productIds).toEqual(["csap", "cftr"]);
    expect(scope.filterMode).toBe("multi");
  });

  it("denies dropdown product without credentials", () => {
    const scope = resolveProductScope(
      { query: "list alerts", productId: "csap" },
      "list alerts",
      { allowedProductIds: ["ctix"] }
    );
    expect(scope.accessViolation?.deniedProductIds).toEqual(["csap"]);
  });

  it("defaults dropdown to first connected product when UI still shows CTIX", () => {
    const scope = resolveProductScope(
      { query: "list alerts", productId: "ctix" },
      "list alerts",
      { allowedProductIds: ["cftr"] }
    );
    expect(scope.accessViolation?.deniedProductIds).toEqual(["ctix"]);
  });
});

describe("enforceCatalogPlan credential allowlist", () => {
  it("lists only connected products", () => {
    const plan = enforceCatalogPlan(
      { workflow: "", confidence: 0, steps: [], citations: [] },
      "What products are documented here?",
      ["ctix", "cftr"]
    );
    expect(plan.citations).toHaveLength(2);
    expect(plan.workflow).toMatch(/CTIX/);
    expect(plan.workflow).toMatch(/CFTR/);
    expect(plan.workflow).not.toMatch(/CSAP/);
    expect(plan.workflow).not.toMatch(/Orchestrate/);
  });
});

describe("buildProductAccessDeniedResponse", () => {
  it("returns PRODUCT_NOT_AUTHORIZED with allowed products", () => {
    const response = buildProductAccessDeniedResponse(["csap"], ["ctix", "cftr"]);
    expect(response.code).toBe("PRODUCT_NOT_AUTHORIZED");
    expect(response.allowedProductIds).toEqual(["ctix", "cftr"]);
    expect(response.workflow).toMatch(/CSAP/);
    expect(response.workflow).toMatch(/CTIX/);
    expect(response.workflow).toMatch(/CFTR/);
  });
});

describe("buildProductClarificationQuestions", () => {
  it("only asks about connected products", () => {
    const questions = buildProductClarificationQuestions(["ctix", "cftr"]);
    expect(questions.some((q) => q.includes("CTIX"))).toBe(true);
    expect(questions.some((q) => q.includes("CFTR"))).toBe(true);
    expect(questions.some((q) => q.includes("CSAP"))).toBe(false);
  });
});

describe("client agent product helpers", () => {
  const prompts = [
    "How do I authenticate a CTIX API request?",
    "Show a Python example for creating an Orchestrate workflow",
    "Explain the required parameters for creating a CSAP alert",
  ];

  it("filters quick starts to connected products", () => {
    const filtered = quickStartsForProducts(prompts, ["ctix"], inferProductsFromQuery);
    expect(filtered).toEqual([prompts[0]]);
  });

  it("clamps product scope to the only connected product", () => {
    expect(clampAgentProductId("csap", ["ctix"])).toBe("ctix");
    expect(clampAgentProductId("all", ["ctix"])).toBe("ctix");
  });

  it("keeps all scope when multiple products are connected", () => {
    expect(clampAgentProductId("all", ["ctix", "cftr"])).toBe("all");
    expect(clampAgentProductId("cftr", ["ctix", "cftr"])).toBe("cftr");
    expect(clampAgentProductId("csap", ["ctix", "cftr"])).toBe("all");
  });
});

describe("listValidCredentialProductIds", () => {
  let tmpDir = "";
  let organizationId = "";
  let userId = "";

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cred-products-"));
    setTestDatabasePath(path.join(tmpDir, "test.db"));
    resetDatabaseConnection();

    const user = await createUserFromInvite({
      auth0UserId: "auth0|cred-products",
      email: "cred-products@test.local",
      role: "developer",
    });
    userId = user.id;
    const organization = await createOrganization({
      name: "Cred Products Org",
      slug: `cred-products-${Date.now()}`,
    });
    organizationId = organization.id;
    await createMembership({
      organizationId,
      userId,
      role: "developer",
    });
  });

  afterEach(() => {
    resetDatabaseConnection();
    setTestDatabasePath(null);
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns only valid, non-expired products in registry order", async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const past = new Date(Date.now() - 86_400_000).toISOString();

    await upsertCredential({
      organizationId,
      userId,
      productId: "cftr",
      baseUrl: "https://tenant.example.com/cftrapi",
      accessIdMasked: "ab••cd",
      secretCiphertext: "cipher",
      secretIv: "iv",
      secretTag: "tag",
      status: "valid",
      expiresAt: future,
    });
    await upsertCredential({
      organizationId,
      userId,
      productId: "ctix",
      baseUrl: "https://tenant.example.com/ctixapi",
      accessIdMasked: "ab••cd",
      secretCiphertext: "cipher",
      secretIv: "iv",
      secretTag: "tag",
      status: "valid",
      expiresAt: null,
    });
    await upsertCredential({
      organizationId,
      userId,
      productId: "csap",
      baseUrl: "https://tenant.example.com/csapapi",
      accessIdMasked: "ab••cd",
      secretCiphertext: "cipher",
      secretIv: "iv",
      secretTag: "tag",
      status: "invalid",
    });
    await upsertCredential({
      organizationId,
      userId,
      productId: "orchestrate",
      baseUrl: "https://tenant.example.com/soarapi",
      accessIdMasked: "ab••cd",
      secretCiphertext: "cipher",
      secretIv: "iv",
      secretTag: "tag",
      status: "valid",
      expiresAt: past,
    });

    const ids = await listValidCredentialProductIds(organizationId, userId);
    expect(ids).toEqual(["ctix", "cftr"]);
  });
});

describe("runAgent product access enforcement", () => {
  it("returns PRODUCT_NOT_AUTHORIZED without retrieving other product docs", async () => {
    const response = await runAgent({
      query: "CFTR: how do I list incidents?",
      productId: "ctix",
      allowedProductIds: ["ctix"],
    });
    expect(response.code).toBe("PRODUCT_NOT_AUTHORIZED");
    expect(response.allowedProductIds).toEqual(["ctix"]);
    expect(response.steps).toHaveLength(0);
  });
});
