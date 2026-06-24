import { describe, expect, it } from "vitest";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { authKeyValues, baseUrlForProduct } from "@/lib/products/auth";
import { getProduct, inferProductFromQuery, isAllowedBaseUrl, listProducts } from "@/lib/products/registry";
import { buildRunnableRequest, buildEndpointSnippets } from "@/lib/snippets";
import { DISPLAY_BASE } from "@/lib/constants";
import type { EndpointPage } from "@/lib/types";

const ROOT = path.join(process.cwd(), "src", "content");

async function manifestExists(productId: string): Promise<boolean> {
  const p =
    productId === "ctix"
      ? path.join(ROOT, "manifest.json")
      : path.join(ROOT, "products", productId, "manifest.json");
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function readManifest(productId: string) {
  const p =
    productId === "ctix"
      ? path.join(ROOT, "manifest.json")
      : path.join(ROOT, "products", productId, "manifest.json");
  return JSON.parse(await readFile(p, "utf8"));
}

const sampleEndpoint: EndpointPage = {
  slug: "ping/ping",
  title: "Ping",
  kind: "endpoint",
  breadcrumb: ["ping", "ping"],
  description: "Health check",
  method: "GET",
  path: "ping/",
  request: { query: [{ name: "verbose", value: "true", valueType: "boolean" }] },
  responses: [],
};

describe("product registry", () => {
  it("lists four Cyware products", () => {
    expect(listProducts()).toHaveLength(4);
    expect(getProduct("ctix")?.displayLabel).toContain("CTIX");
    expect(getProduct("csap")?.displayLabel).toBe("CSAP");
    expect(getProduct("orchestrate")?.displayLabel).toContain("Orchestrate");
    expect(getProduct("cftr")?.displayLabel).toBe("CFTR");
  });

  it("infers product from natural language", () => {
    expect(inferProductFromQuery("How do I create an incident in CSAP?")).toBe("csap");
    expect(inferProductFromQuery("Orchestrate playbook create API")).toBe("orchestrate");
    expect(inferProductFromQuery("CFTR reports endpoint")).toBe("cftr");
    expect(inferProductFromQuery("list STIX indicators")).toBe("ctix");
    expect(inferProductFromQuery("search all Cyware APIs for indicators")).toBe("all");
  });

  it("validates allowed base URLs per product", () => {
    expect(isAllowedBaseUrl("ctix", "https://tenant.cyware.com/ctixapi/ping/")).toBe(true);
    expect(isAllowedBaseUrl("csap", "https://tenant.cyware.com/csap/api/")).toBe(true);
    expect(isAllowedBaseUrl("ctix", "https://evil.example.com/ctixapi/")).toBe(false);
  });
});

describe("product-specific snippets", () => {
  it("CTIX snippets include Open API auth query params", () => {
    const req = buildRunnableRequest(sampleEndpoint, "ctix");
    const names = req.query.map((q) => q.name);
    expect(names).toContain("AccessID");
    expect(names).toContain("Signature");
    expect(names).toContain("Expires");
    expect(buildEndpointSnippets(sampleEndpoint, "ctix")[0].code).toContain(DISPLAY_BASE);
  });

  it("Orchestrate snippets use Orchestrate base URL placeholder", () => {
    const snippets = buildEndpointSnippets(sampleEndpoint, "orchestrate");
    expect(snippets[0].code).toContain(baseUrlForProduct("orchestrate"));
    const auth = authKeyValues("orchestrate");
    expect(auth.query.some((q) => q.name === "AccessID")).toBe(true);
  });

  it("CSAP snippets use Open API auth query params", () => {
    const req = buildRunnableRequest(sampleEndpoint, "csap");
    expect(req.query.some((q) => q.name === "AccessID")).toBe(true);
    expect(req.query.some((q) => q.name === "Signature")).toBe(true);
  });

  it("CFTR test connectivity path is normalized", () => {
    const page: EndpointPage = {
      ...sampleEndpoint,
      slug: "cftr-api-reference/authentication/test-connectivity",
      path: "{{base_url}}/test-connectivity/?AccessID={{open_api_access_id}}&Expires={{expires}}&Signature={{signature}}",
    };
    const req = buildRunnableRequest(page, "cftr");
    expect(req.path).toBe("/test-connectivity/");
    expect(req.query.map((q) => q.name)).toContain("AccessID");
  });

  it("never includes real secrets in generated snippets", () => {
    for (const productId of ["ctix", "csap", "orchestrate", "cftr"]) {
      const snippets = buildEndpointSnippets(sampleEndpoint, productId);
      for (const s of snippets) {
        expect(s.code).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
        expect(s.code).not.toMatch(/e61e92fb-bfd9/);
      }
    }
  });
});

describe("CSAP content", () => {
  it("CSAP docs can be ingested", async () => {
    expect(await manifestExists("csap")).toBe(true);
  });

  it("CSAP manifest has pages", async () => {
    const manifest = await readManifest("csap");
    expect(manifest.count).toBeGreaterThan(0);
    expect(manifest.productId).toBe("csap");
  });
});

describe("Orchestrate content", () => {
  it("Orchestrate docs can be ingested", async () => {
    expect(await manifestExists("orchestrate")).toBe(true);
  });

  it("Orchestrate manifest has pages", async () => {
    const manifest = await readManifest("orchestrate");
    expect(manifest.count).toBeGreaterThan(0);
  });
});

describe("CFTR content", () => {
  it("CFTR docs can be ingested", async () => {
    expect(await manifestExists("cftr")).toBe(true);
  });

  it("CFTR manifest has pages", async () => {
    const manifest = await readManifest("cftr");
    expect(manifest.count).toBeGreaterThan(0);
  });
});

describe("cross-product search", () => {
  it("combined index includes multiple products when built", async () => {
    const { loadCombinedAgentIndex, searchDocs, clearCombinedIndexCache } = await import(
      "@/lib/products/search"
    );
    clearCombinedIndexCache();
    const index = await loadCombinedAgentIndex();
    expect(index.chunkCount).toBeGreaterThan(500);

    const csapResults = searchDocs(index, "alert collaboration", { productId: "csap", limit: 5 });
    expect(csapResults.length).toBeGreaterThan(0);
    expect(csapResults.every((r) => r.productId === "csap")).toBe(true);

    const orchResults = searchDocs(index, "playbook automation", { productId: "orchestrate", limit: 5 });
    expect(orchResults.length).toBeGreaterThan(0);
    expect(orchResults.every((r) => r.productId === "orchestrate")).toBe(true);

    const allResults = searchDocs(index, "authentication credentials", { productId: "all", limit: 10 });
    const productIds = new Set(allResults.map((r) => r.productId));
    expect(productIds.size).toBeGreaterThan(1);
  });

  it("product-specific search does not leak unrelated products for CSAP", async () => {
    const { loadCombinedAgentIndex, searchDocs, clearCombinedIndexCache } = await import(
      "@/lib/products/search"
    );
    clearCombinedIndexCache();
    const index = await loadCombinedAgentIndex();
    const results = searchDocs(index, "playbook execute action", { productId: "csap", limit: 8 });
    expect(results.every((r) => r.productId === "csap")).toBe(true);
  });
});

describe("CTIX backward compatibility", () => {
  it("existing CTIX manifest still present", async () => {
    expect(await manifestExists("ctix")).toBe(true);
    const manifest = await readManifest("ctix");
    expect(manifest.count).toBeGreaterThan(500);
  });

  it("existing CTIX runnable snippet still works for default product", () => {
    const req = buildRunnableRequest(sampleEndpoint);
    expect(req.query.map((q) => q.name)).toContain("AccessID");
  });
});
