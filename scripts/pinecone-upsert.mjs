#!/usr/bin/env node
/**
 * Embed agent doc indexes and upsert into Pinecone for RAG retrieval (all products).
 *
 * - Creates the serverless index if it does not exist (dimension 512, cosine).
 * - Embeds each chunk with OpenAI text-embedding-3-small (512-dim).
 * - Upserts vectors with metadata (productId, slug, title, method, path, kind).
 *
 * Usage:
 *   node scripts/pinecone-upsert.mjs [--product=ctix|csap|orchestrate|cftr]
 *
 * Requires (from .env.local or the environment):
 *   OPENAI_API_KEY, PINECONE_API_KEY, PINECONE_INDEX, PINECONE_CLOUD, PINECONE_REGION
 *
 * Run `npm run build:index` first to generate per-product agent-index.json files.
 */
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PRODUCTS, contentDirForProduct } from "./products-config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CONTROL_PLANE = "https://api.pinecone.io";
const EMBED_DIM = 512;

/** Minimal .env.local loader so this runs on any Node version. */
function loadEnvLocal() {
  const file = path.join(ROOT, ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, key, rawVal] = m;
    if (process.env[key]) continue;
    process.env[key] = rawVal.replace(/^["']|["']$/g, "");
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function indexPathForProduct(product) {
  if (product.productId === "ctix") {
    return path.join(ROOT, "src", "content", "agent-index.json");
  }
  return path.join(contentDirForProduct(ROOT, product).contentDir, "agent-index.json");
}

async function loadChunks(productFilter) {
  const targets = productFilter
    ? PRODUCTS.filter((p) => p.productId === productFilter)
    : PRODUCTS;

  const chunks = [];
  for (const product of targets) {
    const indexPath = indexPathForProduct(product);
    try {
      const index = JSON.parse(await readFile(indexPath, "utf8"));
      const productChunks = index.chunks ?? [];
      for (const c of productChunks) {
        chunks.push({ ...c, productId: c.productId ?? product.productId });
      }
      console.log(`[${product.productId}] Loaded ${productChunks.length} chunks from ${indexPath}`);
    } catch {
      console.warn(`[${product.productId}] Skipped — no index at ${indexPath} (run: npm run build:index -- --product=${product.productId})`);
    }
  }
  return chunks;
}

async function embedBatch(texts, apiKey) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: texts,
      dimensions: EMBED_DIM,
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI embeddings ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  return data.data.map((d) => d.embedding);
}

async function pc(url, apiKey, init = {}) {
  return fetch(url, {
    ...init,
    headers: {
      "Api-Key": apiKey,
      "Content-Type": "application/json",
      "X-Pinecone-API-Version": "2025-01",
      ...(init.headers ?? {}),
    },
  });
}

async function ensureIndex(cfg) {
  const describe = await pc(`${CONTROL_PLANE}/indexes/${cfg.indexName}`, cfg.apiKey);
  if (describe.ok) {
    const data = await describe.json();
    if (data.host) {
      console.log(`Index "${cfg.indexName}" exists (host ${data.host}).`);
      return data.host;
    }
  }

  console.log(`Creating serverless index "${cfg.indexName}" (${cfg.cloud}/${cfg.region}, dim ${EMBED_DIM})…`);
  const create = await pc(`${CONTROL_PLANE}/indexes`, cfg.apiKey, {
    method: "POST",
    body: JSON.stringify({
      name: cfg.indexName,
      dimension: EMBED_DIM,
      metric: "cosine",
      spec: { serverless: { cloud: cfg.cloud, region: cfg.region } },
    }),
  });
  if (!create.ok && create.status !== 409) {
    throw new Error(`Create index ${create.status}: ${(await create.text()).slice(0, 300)}`);
  }

  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const res = await pc(`${CONTROL_PLANE}/indexes/${cfg.indexName}`, cfg.apiKey);
    if (res.ok) {
      const data = await res.json();
      if (data.status?.ready && data.host) {
        console.log(`Index ready (host ${data.host}).`);
        return data.host;
      }
    }
  }
  throw new Error("Index did not become ready in time.");
}

async function upsertBatch(host, apiKey, vectors, namespace) {
  const res = await pc(`https://${host}/vectors/upsert`, apiKey, {
    method: "POST",
    body: JSON.stringify({
      vectors,
      ...(namespace ? { namespace } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`Upsert ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

async function main() {
  loadEnvLocal();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const cfg = {
    apiKey: process.env.PINECONE_API_KEY?.trim(),
    indexName: process.env.PINECONE_INDEX?.trim() || "intel-exchange-docs",
    cloud: process.env.PINECONE_CLOUD?.trim() || "aws",
    region: process.env.PINECONE_REGION?.trim() || "us-east-1",
  };
  if (!openaiKey) throw new Error("OPENAI_API_KEY is required.");
  if (!cfg.apiKey) throw new Error("PINECONE_API_KEY is required.");

  let productFilter = null;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--product=")) productFilter = arg.slice("--product=".length);
  }

  const chunks = await loadChunks(productFilter);
  if (chunks.length === 0) {
    throw new Error("No chunks loaded. Run `npm run build:index` for each product first.");
  }
  console.log(`Total: ${chunks.length} chunks across ${productFilter ?? "all products"}`);

  const host = await ensureIndex(cfg);
  const namespace =
    process.env.VECTOR_NAMESPACE?.trim() ||
    (productFilter ? `product-${productFilter}` : undefined);

  const batchSize = 64;
  let upserted = 0;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const embeddings = await embedBatch(
      batch.map((c) => c.text.slice(0, 8000)),
      openaiKey
    );
    const vectors = batch.map((c, j) => ({
      id: c.id,
      values: embeddings[j],
      metadata: {
        productId: c.productId,
        slug: c.slug,
        title: c.title,
        kind: c.kind,
        ...(c.method ? { method: c.method } : {}),
        ...(c.path ? { path: c.path } : {}),
      },
    }));
    await upsertBatch(host, cfg.apiKey, vectors, namespace);
    upserted += vectors.length;
    process.stdout.write(`  upserted ${upserted}/${chunks.length}\r`);
  }
  console.log(`\nDone. Upserted ${upserted} vectors into "${cfg.indexName}"${namespace ? ` (namespace: ${namespace})` : ""}.`);
}

main().catch((err) => {
  console.error("\n" + (err?.message ?? err));
  process.exit(1);
});
