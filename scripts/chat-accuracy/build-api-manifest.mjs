#!/usr/bin/env node
/**
 * Generate a deterministic endpoint inventory from vendored documentation.
 * This deliberately reads local source only; it never contacts API providers.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PRODUCTS, contentDirForProduct } from "../products-config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const OUTPUT_DIR = path.join(ROOT, "artifacts", "chat-accuracy");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "api-manifest.json");

function filenameForSlug(slug) {
  return `${slug.replace(/\//g, "__")}.json`;
}

function normalizePath(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const withoutQuery = value.trim().split(/[?#]/, 1)[0].replace(/\\/g, "/");
  return `/${withoutQuery.replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/")}/`
    .replace(/^\/{2,}/, "/");
}

function sourceUrl(product, slug) {
  if (product.docsSourceType === "postman") return `${product.docsOrigin}/`;
  return `${product.docsOrigin}/${slug}.md`;
}

function deprecationFor(page) {
  const value = page.deprecation ?? page.deprecated ?? page.isDeprecated;
  if (typeof value === "string" || typeof value === "boolean") return value;
  return null;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function buildManifest() {
  const entriesByKey = new Map();
  const counts = Object.fromEntries(PRODUCTS.map(({ productId }) => [productId, 0]));

  for (const product of PRODUCTS) {
    const dirs = contentDirForProduct(ROOT, product);
    const manifest = await readJson(dirs.manifestPath);

    for (const meta of manifest.pages ?? []) {
      if (meta.kind !== "endpoint") continue;

      let page;
      try {
        page = await readJson(path.join(dirs.pagesDir, filenameForSlug(meta.slug)));
      } catch (error) {
        throw new Error(`Unable to read endpoint page ${product.productId}:${meta.slug}`, {
          cause: error,
        });
      }

      const method = typeof page.method === "string" ? page.method.toUpperCase() : null;
      const endpointPath = normalizePath(page.path);
      if (!method || !endpointPath) {
        throw new Error(`Endpoint ${product.productId}:${page.slug ?? meta.slug} lacks method or path`);
      }

      const entry = {
        productId: product.productId,
        method,
        path: endpointPath,
        title: page.title ?? meta.title ?? meta.slug,
        slug: page.slug ?? meta.slug,
        sourceUrl: sourceUrl(product, page.slug ?? meta.slug),
        sourceId: `${product.productId}:${page.slug ?? meta.slug}`,
        kind: page.kind ?? "endpoint",
        deprecation: deprecationFor(page),
      };
      const key = `${entry.productId}\u0000${entry.method}\u0000${entry.path}`;
      const current = entriesByKey.get(key);
      if (!current || entry.slug.localeCompare(current.slug) < 0) entriesByKey.set(key, entry);
    }
  }

  const entries = [...entriesByKey.values()].sort(
    (a, b) =>
      a.productId.localeCompare(b.productId) ||
      a.path.localeCompare(b.path) ||
      a.method.localeCompare(b.method)
  );
  for (const entry of entries) counts[entry.productId] += 1;

  for (const [productId, count] of Object.entries(counts)) {
    if (count === 0) throw new Error(`Manifest integrity failure: ${productId} has zero endpoints.`);
  }

  const output = {
    version: 1,
    generatedAt: new Date().toISOString(),
    endpointCount: entries.length,
    contentHash: createHash("sha256")
      .update(JSON.stringify(entries))
      .digest("hex")
      .slice(0, 16),
    counts,
    entries,
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  for (const product of PRODUCTS) console.log(`${product.productId}: ${counts[product.productId]} endpoints`);
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_PATH)} (${entries.length} endpoints)`);
}

buildManifest().catch((error) => {
  console.error(`chat:manifest failed: ${error.message}`);
  process.exitCode = 1;
});
