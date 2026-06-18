#!/usr/bin/env node
/**
 * Build lexical (+ optional embedding) search index for the docs agent.
 * Usage: node scripts/build-agent-index.mjs [--embed]
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PAGES_DIR = path.join(ROOT, "src", "content", "pages");
const MANIFEST_PATH = path.join(ROOT, "src", "content", "manifest.json");
const OUT_PATH = path.join(ROOT, "src", "content", "agent-index.json");

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
  for (const t of tokens) {
    terms[t] = (terms[t] ?? 0) + 1;
  }
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

/** Extra retrieval text for endpoints whose titles are too generic on their own. */
const DISAMBIGUATION_HINTS = {
  "threat-mailbox/search-url":
    "Disambiguation: Threat Mailbox — search for a URL or link inside email feed messages " +
    "(GET conversion/feed-sources/email/deep-search/). NOT third-party indicator repository search. " +
    "Use when the user wants to find URLs or IOCs extracted from threat mailbox emails.",
  "reports/download-file":
    "Disambiguation: Reports — download an external intel or report file by file_id and token " +
    "(GET ingestion/external_download/{file_id}/). NOT IOC listing or generic file browse. " +
    "Use when the user has a report download link, file_id, or authorization token.",
};

function chunkEndpoint(page) {
  const parts = [
    page.title,
    page.breadcrumb.join(" > "),
    `${page.method} ${page.path}`,
    page.description?.trim() || "",
    DISAMBIGUATION_HINTS[page.slug],
    describeParams(page.request?.path, "Path parameters"),
    describeParams(page.request?.query, "Query parameters"),
    describeParams(page.request?.header, "Headers"),
    describeParams(page.request?.body, "Body fields"),
  ].filter(Boolean);

  return {
    id: `${page.slug}::endpoint`,
    slug: page.slug,
    title: page.title,
    kind: "endpoint",
    method: page.method,
    path: page.path,
    breadcrumb: page.breadcrumb,
    text: parts.join("\n\n"),
  };
}

function chunkSection(page) {
  const md = page.markdown?.trim() || "";
  const excerpt = md.length > 1200 ? `${md.slice(0, 1200)}…` : md;
  return {
    id: `${page.slug}::section`,
    slug: page.slug,
    title: page.title,
    kind: "section",
    breadcrumb: page.breadcrumb,
    text: [page.title, page.breadcrumb.join(" > "), excerpt].filter(Boolean).join("\n\n"),
  };
}

function fileNameForSlug(slug) {
  return slug.replace(/\//g, "__") + ".json";
}

async function loadPage(slug) {
  const file = path.join(PAGES_DIR, fileNameForSlug(slug));
  const raw = await readFile(file, "utf8");
  return JSON.parse(raw);
}

async function embedBatch(texts, apiKey) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: texts,
      dimensions: 512,
    }),
  });
  if (!res.ok) {
    throw new Error(`Embedding API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  return data.data.map((d) => d.embedding);
}

async function main() {
  const embed = process.argv.includes("--embed");
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (embed && !apiKey) {
    console.error("--embed requires OPENAI_API_KEY");
    process.exit(1);
  }

  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  const chunks = [];

  for (const meta of manifest.pages) {
    let page;
    try {
      page = await loadPage(meta.slug);
    } catch {
      continue;
    }
    if (page.kind === "endpoint") {
      chunks.push(chunkEndpoint(page));
    } else if (page.kind === "section" && page.markdown?.trim()) {
      chunks.push(chunkSection(page));
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
    for (const term of Object.keys(terms)) {
      df[term] = (df[term] ?? 0) + 1;
    }
  }

  if (embed && apiKey) {
    console.log(`Embedding ${chunks.length} chunks…`);
    const batchSize = 64;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const texts = batch.map((c) => c.text.slice(0, 8000));
      const vectors = await embedBatch(texts, apiKey);
      for (let j = 0; j < batch.length; j++) {
        batch[j].embedding = vectors[j];
      }
      process.stdout.write(`  ${Math.min(i + batchSize, chunks.length)}/${chunks.length}\r`);
    }
    console.log("");
  }

  const index = {
    version: 1,
    generatedAt: new Date().toISOString(),
    chunkCount: chunks.length,
    hasEmbeddings: embed && !!apiKey,
    chunks,
    lexical: {
      docCount: docs.length,
      avgDocLen: docs.length ? totalLen / docs.length : 1,
      df,
      docs,
    },
  };

  await writeFile(OUT_PATH, JSON.stringify(index));
  const sizeMb = (Buffer.byteLength(JSON.stringify(index)) / (1024 * 1024)).toFixed(2);
  console.log(`Wrote ${OUT_PATH} — ${chunks.length} chunks, ${sizeMb} MB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
