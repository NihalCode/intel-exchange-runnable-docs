#!/usr/bin/env node
/**
 * Build lexical search index for all products (or one with --product=).
 * Usage: node scripts/build-agent-index.mjs [--embed] [--product=ctix|csap|...]
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PRODUCTS, contentDirForProduct } from "./products-config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const STOP = new Set([
  "a", "an", "the", "and", "or", "to", "of", "in", "for", "on", "with", "is", "are",
  "be", "by", "at", "from", "as", "it", "this", "that", "i", "my", "me", "we", "you",
  "how", "what", "when", "where", "which", "can", "do", "does", "get", "use", "using",
]);

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_/+-]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

function termFrequencies(tokens) {
  const terms = {};
  for (const t of tokens) terms[t] = (terms[t] ?? 0) + 1;
  return terms;
}

function describeParams(fields, label) {
  if (!fields?.length) return "";
  const lines = fields
    .filter((f) => f.name)
    .map((f) => {
      const req = f.isRequired ? "required" : "optional";
      const desc = f.description?.trim() || "";
      return `- ${f.name} (${req}${f.valueType ? `, ${f.valueType}` : ""})${desc ? `: ${desc}` : ""}`;
    });
  return `${label}:\n${lines.join("\n")}`;
}

function chunkEndpoint(page, productId) {
  const parts = [
    page.title,
    page.breadcrumb.join(" > "),
    `${page.method} ${page.path}`,
    page.description?.trim() || "",
    describeParams(page.request?.path, "Path parameters"),
    describeParams(page.request?.query, "Query parameters"),
    describeParams(page.request?.header, "Headers"),
    describeParams(page.request?.body, "Body fields"),
  ].filter(Boolean);

  return {
    id: `${page.slug}::endpoint`,
    productId,
    slug: page.slug,
    title: page.title,
    kind: "endpoint",
    method: page.method,
    path: page.path,
    breadcrumb: page.breadcrumb,
    contentType: "endpoint",
    text: parts.join("\n\n"),
  };
}

function chunkSection(page, productId) {
  const md = page.markdown?.trim() || "";
  const excerpt = md.length > 1200 ? `${md.slice(0, 1200)}…` : md;
  return {
    id: `${page.slug}::section`,
    productId,
    slug: page.slug,
    title: page.title,
    kind: "section",
    breadcrumb: page.breadcrumb,
    contentType: "overview",
    text: [page.title, page.breadcrumb.join(" > "), excerpt].filter(Boolean).join("\n\n"),
  };
}

function fileNameForSlug(slug) {
  return slug.replace(/\//g, "__") + ".json";
}

async function loadPage(pagesDir, slug) {
  const file = path.join(pagesDir, fileNameForSlug(slug));
  const raw = await readFile(file, "utf8");
  return JSON.parse(raw);
}

async function embedBatch(texts, apiKey) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", input: texts, dimensions: 512 }),
  });
  if (!res.ok) throw new Error(`Embedding API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.data.map((d) => d.embedding);
}

async function buildIndexForProduct(product, embed, apiKey) {
  const dirs = contentDirForProduct(ROOT, product);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(dirs.manifestPath, "utf8"));
  } catch {
    console.warn(`Skipping ${product.productId}: no manifest at ${dirs.manifestPath}`);
    return null;
  }

  const chunks = [];
  for (const meta of manifest.pages) {
    let page;
    try {
      page = await loadPage(dirs.pagesDir, meta.slug);
    } catch {
      continue;
    }
    if (page.kind === "endpoint") chunks.push(chunkEndpoint(page, product.productId));
    else if (page.kind === "section" && page.markdown?.trim()) {
      chunks.push(chunkSection(page, product.productId));
    }
  }

  const docs = [];
  const df = {};
  let totalLen = 0;
  for (const chunk of chunks) {
    const tokens = tokenize(chunk.text);
    const terms = termFrequencies(tokens);
    const length = tokens.length;
    totalLen += length;
    docs.push({ chunkId: chunk.id, length, terms });
    for (const term of Object.keys(terms)) df[term] = (df[term] ?? 0) + 1;
  }

  if (embed && apiKey) {
    console.log(`[${product.productId}] Embedding ${chunks.length} chunks…`);
    const batchSize = 64;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const texts = batch.map((c) => c.text.slice(0, 8000));
      const vectors = await embedBatch(texts, apiKey);
      for (let j = 0; j < batch.length; j++) batch[j].embedding = vectors[j];
    }
  }

  const index = {
    version: 1,
    productId: product.productId,
    generatedAt: new Date().toISOString(),
    chunkCount: chunks.length,
    hasEmbeddings: embed && !!apiKey,
    chunks,
    lexical: { docCount: docs.length, avgDocLen: docs.length ? totalLen / docs.length : 1, df, docs },
  };

  const outPath =
    product.productId === "ctix"
      ? path.join(ROOT, "src", "content", "agent-index.json")
      : path.join(dirs.contentDir, "agent-index.json");

  await writeFile(outPath, JSON.stringify(index));
  console.log(`[${product.productId}] Wrote ${outPath} — ${chunks.length} chunks`);
  return index;
}

async function main() {
  const embed = process.argv.includes("--embed");
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (embed && !apiKey) {
    console.error("--embed requires OPENAI_API_KEY");
    process.exit(1);
  }

  let productFilter = null;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--product=")) productFilter = arg.slice("--product=".length);
  }

  const targets = productFilter
    ? PRODUCTS.filter((p) => p.productId === productFilter)
    : PRODUCTS;

  for (const product of targets) {
    await buildIndexForProduct(product, embed, apiKey);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
