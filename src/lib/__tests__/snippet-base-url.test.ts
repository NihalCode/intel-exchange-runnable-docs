import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { DISPLAY_BASE } from "../constants";
import { baseUrlForProduct } from "../products/auth";
import { applyRuntimeBaseUrl, rewriteUrlWithRuntimeBase } from "../snippet-base-url";
import { buildEndpointSnippets, codeForRunnableRequest } from "../snippets";
import { buildRunnableRequest } from "../snippets";
import type { EndpointPage } from "../types";

const TENANT = "https://mytenant.cyware.com";

const CONNECTIVITY: Record<
  string,
  { slug: string; baseSuffix: string; wrongSuffix: string }
> = {
  ctix: { slug: "ping/ping", baseSuffix: "/ctixapi", wrongSuffix: "/cftrapi" },
  cftr: {
    slug: "cftr-api-reference/authentication/test-connectivity",
    baseSuffix: "/cftrapi",
    wrongSuffix: "/ctixapi",
  },
  orchestrate: {
    slug: "authentication/test-connectivity",
    baseSuffix: "orchestrateapi.cyware.com",
    wrongSuffix: "/ctixapi",
  },
  csap: {
    slug: "analyst-portal/authentication/test-connectivity",
    baseSuffix: "csapapi.cyware.com",
    wrongSuffix: "/ctixapi",
  },
};

async function loadEndpoint(productId: string, slug: string): Promise<EndpointPage> {
  const file =
    productId === "ctix"
      ? path.join(process.cwd(), "src/content/pages", `${slug.replace(/\//g, "__")}.json`)
      : path.join(
          process.cwd(),
          "src/content/products",
          productId,
          "pages",
          `${slug.replace(/\//g, "__")}.json`
        );
  return JSON.parse(await readFile(file, "utf8")) as EndpointPage;
}

describe("applyRuntimeBaseUrl", () => {
  it("replaces CTIX DISPLAY_BASE in snippet code", () => {
    const code = `url = "${DISPLAY_BASE}/ping/"`;
    expect(applyRuntimeBaseUrl(code, `${TENANT}/ctixapi`)).toContain(
      `${TENANT}/ctixapi/ping/`
    );
  });

  it("replaces CFTR template base in snippet code", () => {
    const template = baseUrlForProduct("cftr");
    const code = `url = "${template}/test-connectivity/"`;
    expect(applyRuntimeBaseUrl(code, `${TENANT}/cftrapi`)).toContain(
      `${TENANT}/cftrapi/test-connectivity/`
    );
    expect(applyRuntimeBaseUrl(code, `${TENANT}/cftrapi`)).not.toContain("/ctixapi");
  });

  it("replaces legacy tenantname.com manifest URLs", () => {
    const code = 'url = "https://tenantname.com/cftrapi/test-connectivity/"';
    expect(applyRuntimeBaseUrl(code, `${TENANT}/cftrapi`)).toBe(
      `url = "${TENANT}/cftrapi/test-connectivity/"`
    );
  });
});

describe("rewriteUrlWithRuntimeBase", () => {
  it("rewrites orchestrate template URLs", () => {
    const template = baseUrlForProduct("orchestrate");
    const url = `${template}/authentication/test-connectivity`;
    expect(rewriteUrlWithRuntimeBase(url, `${TENANT}/co`)).toBe(
      `${TENANT}/co/authentication/test-connectivity`
    );
  });
});

describe("connectivity endpoints — all four products", () => {
  function runtimeBaseFor(productId: string, cfg: (typeof CONNECTIVITY)[string]): string {
    if (productId === "csap") return "https://csapapi.cyware.com";
    if (productId === "orchestrate") return "https://orchestrateapi.cyware.com";
    return `${TENANT}${cfg.baseSuffix}`;
  }

  for (const [productId, cfg] of Object.entries(CONNECTIVITY)) {
    it(`${productId} snippets use ${cfg.baseSuffix} base, not ${cfg.wrongSuffix}`, async () => {
      const page = await loadEndpoint(productId, cfg.slug);
      const runtimeBase = runtimeBaseFor(productId, cfg);
      const snippets = buildEndpointSnippets(page, productId);
      const python = snippets.find((s) => s.label === "Python")!;
      expect(python.code).toContain(cfg.baseSuffix);
      expect(python.code).not.toContain(cfg.wrongSuffix);

      const rewritten = applyRuntimeBaseUrl(python.code, runtimeBase);
      expect(rewritten).toContain(runtimeBase);
      expect(rewritten).not.toContain(cfg.wrongSuffix);
    });

    it(`${productId} agent-style codeForRunnableRequest respects runtime base`, async () => {
      const page = await loadEndpoint(productId, cfg.slug);
      const req = buildRunnableRequest(page, productId);
      const runtimeBase = runtimeBaseFor(productId, cfg);
      const code = codeForRunnableRequest(req, "python", runtimeBase);
      expect(code).toContain(runtimeBase);
      expect(code).not.toContain(cfg.wrongSuffix);
    });
  }
});
