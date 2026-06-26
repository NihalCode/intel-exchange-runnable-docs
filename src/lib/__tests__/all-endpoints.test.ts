import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { baseUrlForProduct } from "../products/auth";
import { isCftrTenantBaseUrl } from "../cftr-path";
import { buildEndpointSnippets, buildRunnableRequest } from "../snippets";
import { applyPathParams } from "../resolve-request";
import type { EndpointPage } from "../types";

const ROOT = path.join(process.cwd());
const PRODUCTS = [
  { id: "ctix", pagesDir: path.join(ROOT, "src/content/pages") },
  { id: "csap", pagesDir: path.join(ROOT, "src/content/products/csap/pages") },
  { id: "orchestrate", pagesDir: path.join(ROOT, "src/content/products/orchestrate/pages") },
  { id: "cftr", pagesDir: path.join(ROOT, "src/content/products/cftr/pages") },
];

const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/,
];

async function loadEndpoints(pagesDir: string): Promise<EndpointPage[]> {
  let files: string[];
  try {
    files = await readdir(pagesDir);
  } catch {
    return [];
  }
  const out: EndpointPage[] = [];
  for (const f of files.filter((x) => x.endsWith(".json"))) {
    const page = JSON.parse(await readFile(path.join(pagesDir, f), "utf8")) as EndpointPage;
    if (page.kind === "endpoint") out.push(page);
  }
  return out;
}

function fullUrl(productId: string, page: EndpointPage): string {
  const base = baseUrlForProduct(productId).replace(/\/+$/, "");
  const req = buildRunnableRequest(page, productId);
  const p = applyPathParams(req.path, req.pathParams);
  return `${base}${p.startsWith("/") ? p : `/${p}`}`;
}

function validateEndpoint(productId: string, page: EndpointPage): string[] {
  const errors: string[] = [];

  if (!page.method) errors.push("missing method");
  if (!page.path?.trim()) errors.push("empty path");

  try {
    const req = buildRunnableRequest(page, productId);
    if (!req.path || req.path === "/") errors.push("normalized path is empty");

    const snippets = buildEndpointSnippets(page, productId);
    if (snippets.length === 0) errors.push("no snippets generated");

    for (const s of snippets) {
      for (const re of SECRET_PATTERNS) {
        if (re.test(s.code)) errors.push(`snippet ${s.label} contains secret-like value`);
      }
    }

    const url = fullUrl(productId, page);
    if (url.includes("{{") || url.includes("}}")) {
      errors.push(`unresolved Postman variable in URL: ${url.slice(0, 120)}`);
    }
    if (/\{\{[^}]+\}\}/.test(req.path)) {
      errors.push(`unresolved path template: ${req.path}`);
    }

    if (productId === "cftr") {
      const base = baseUrlForProduct("cftr");
      const builtPath = buildRunnableRequest(page, productId).path;
      if (base.includes("cftrapi.cyware.com") && builtPath.startsWith("/v1/")) {
        errors.push(`CFTR built path missing /cftrapi/openapi prefix: ${builtPath}`);
      }
      if (isCftrTenantBaseUrl(base) && builtPath.startsWith("/v1/") && !builtPath.startsWith("/openapi/")) {
        errors.push(`CFTR tenant path missing /openapi prefix: ${builtPath}`);
      }
    }
  } catch (e) {
    errors.push(`build failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  return errors;
}

describe("all product endpoints — snippet & path validation", () => {
  for (const { id, pagesDir } of PRODUCTS) {
    it(`${id}: every endpoint builds valid snippets`, async () => {
      const endpoints = await loadEndpoints(pagesDir);
      expect(endpoints.length).toBeGreaterThan(0);

      const failures: { slug: string; errors: string[] }[] = [];
      for (const page of endpoints) {
        const errors = validateEndpoint(id, page);
        if (errors.length) failures.push({ slug: page.slug, errors });
      }

      if (failures.length > 0) {
        const sample = failures
          .slice(0, 15)
          .map((f) => `  ${f.slug}: ${f.errors.join("; ")}`)
          .join("\n");
        expect.fail(`${id}: ${failures.length}/${endpoints.length} endpoints failed:\n${sample}`);
      }
    });
  }
});
