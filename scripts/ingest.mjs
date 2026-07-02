#!/usr/bin/env node
/**
 * Ingest API documentation for a Cyware product.
 *
 * Usage:
 *   node scripts/ingest.mjs [--product=ctix|csap|orchestrate|cftr] [--delay=ms]
 *
 * CTIX (default) writes to src/content/pages/ + manifest.json (legacy layout).
 * Other products write to src/content/products/{productId}/.
 */
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getProductConfig, contentDirForProduct } from "./products-config.mjs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CONCURRENCY = 12;
const MAX_CRAWL_PAGES = Number(process.env.MAX_CRAWL_PAGES || 0) || Infinity;

function parseArgs() {
  const args = process.argv.slice(2);
  let productId = "ctix";
  let delay = 0;
  let collectionFile = process.env.POSTMAN_COLLECTION_FILE || "";
  /** @type {"js" | "ts"} */
  let parser = "js";
  for (const arg of args) {
    if (arg.startsWith("--product=")) productId = arg.slice("--product=".length);
    if (arg.startsWith("--delay=")) delay = Number(arg.slice("--delay=".length)) || 0;
    if (arg.startsWith("--collection-file=")) collectionFile = arg.slice("--collection-file=".length);
    if (arg.startsWith("--parser=")) {
      const p = arg.slice("--parser=".length);
      if (p === "ts" || p === "js") parser = p;
    }
  }
  return { productId, delay, collectionFile, parser };
}

/** Parse Postman collection with the TypeScript parser (used by Developer Console import). */
async function postmanToRecordsWithTs(collectionFile, productId) {
  const tmpDir = path.join(ROOT, ".tmp");
  await mkdir(tmpDir, { recursive: true });
  const outFile = path.join(tmpDir, `postman-records-${productId}-${Date.now()}.json`);
  const cliPath = path.join(__dirname, "postman-ts-parse-cli.ts");
  const tsxCli = path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
  const result = spawnSync(
    process.execPath,
    [tsxCli, cliPath, `--product=${productId}`, `--collection-file=${collectionFile}`, `--out=${outFile}`],
    { cwd: ROOT, encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error(
      `TypeScript Postman parser failed:\n${(result.stderr || result.stdout || "").slice(-2000)}`
    );
  }
  return JSON.parse(await readFile(outFile, "utf8"));
}

function decodeEntities(input) {
  if (!input) return "";
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, body) => {
    if (body[0] === "#") {
      const isHex = body[1] === "x" || body[1] === "X";
      const code = parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (Number.isFinite(code)) return String.fromCodePoint(code);
      return m;
    }
    return body.toLowerCase() in named ? named[body.toLowerCase()] : m;
  });
}

function extractPre(html) {
  const m = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  if (!m) return "";
  return decodeEntities(m[1]);
}

function convertCodeBlocks(md) {
  return md.replace(
    /<CodeBlock\b([^>]*)>([\s\S]*?)<\/CodeBlock>/g,
    (full, attrsRaw, inner) => {
      let lang = "text";
      const attrMatch = attrsRaw.match(/attributes\s*=\s*'([\s\S]*?)'/);
      if (attrMatch) {
        try {
          const attrs = JSON.parse(attrMatch[1]);
          if (attrs.lang) lang = String(attrs.lang).toLowerCase();
        } catch { /* ignore */ }
      }
      const lines = [];
      const lineRe = /<CodeLine>([\s\S]*?)<\/CodeLine>/g;
      let lm;
      while ((lm = lineRe.exec(inner)) !== null) lines.push(decodeEntities(lm[1]));
      const code = lines.join("\n").replace(/\s+$/g, "");
      return `\n\n\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
    }
  );
}

function convertCallouts(md) {
  return md.replace(/<Callout\b[^>]*>([\s\S]*?)<\/Callout>/g, (full, inner) => {
    const text = inner.replace(/<\/p>\s*<p>/g, "\n").replace(/<\/?[a-zA-Z][^>]*>/g, "").trim();
    if (!text) return "";
    const quoted = text.split("\n").map((l) => `> ${l.trim()}`).join("\n");
    return `\n\n> [!NOTE]\n${quoted}\n\n`;
  });
}

function stripInlineHtml(md) {
  const parts = md.split(/(```[\s\S]*?```)/g);
  return parts
    .map((part) => (part.startsWith("```") ? part : part.replace(/<\/?[a-zA-Z][^>]*>/g, "")))
    .join("");
}

function cleanProse(text) {
  return stripInlineHtml(convertCallouts(convertCodeBlocks(text))).trim();
}

function parseEndpoint(preText) {
  const braceIdx = preText.indexOf("\n{");
  if (braceIdx === -1) return null;
  const description = preText.slice(0, braceIdx).trim();
  const jsonText = preText.slice(braceIdx + 1);
  try {
    const spec = JSON.parse(jsonText);
    if (spec?.endpoints?.method) return { description, spec };
  } catch { /* not endpoint json */ }
  return null;
}

function slugFromUrl(url, project) {
  const u = new URL(url);
  let p = u.pathname;
  const marker = `/${project}/`;
  const i = p.indexOf(marker);
  if (i !== -1) p = p.slice(i + marker.length);
  return p.replace(/\.md$/i, "").replace(/^\/+|\/+$/g, "");
}

function fileNameForSlug(slug) {
  return slug.replace(/\//g, "__") + ".json";
}

async function fetchText(url, product, tries = 3) {
  const headers = { "User-Agent": UA, Accept: "text/html,text/plain,*/*" };
  if (product.docsReferer) headers.Referer = product.docsReferer;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt === tries) throw err;
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
}

function parseIndex(text, project) {
  const entries = [];
  const seen = new Set();
  const re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+?\.md)\)\s*:?\s*([^\n]*)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const title = m[1].trim();
    const url = m[2].trim();
    const desc = (m[3] || "").trim();
    const slug = slugFromUrl(url, project);
    if (seen.has(slug)) continue;
    seen.add(slug);
    entries.push({ title, url, slug, indexDescription: desc });
  }
  return entries;
}

function buildNav(records) {
  const root = { children: new Map() };
  for (const rec of records) {
    const parts = rec.slug.split("/");
    let node = root;
    let acc = [];
    for (let i = 0; i < parts.length; i++) {
      acc.push(parts[i]);
      const key = acc.join("/");
      if (!node.children.has(key)) node.children.set(key, { slug: key, children: new Map() });
      node = node.children.get(key);
      if (i === parts.length - 1) {
        node.title = rec.title;
        node.kind = rec.kind;
        node.method = rec.method || null;
      }
    }
  }
  const titleBySlug = new Map(records.map((r) => [r.slug, r.title]));
  function toArr(node) {
    const arr = [];
    for (const child of node.children.values()) {
      arr.push({
        slug: child.slug,
        title: child.title || titleBySlug.get(child.slug) || child.slug,
        kind: child.kind || "section",
        method: child.method || null,
        children: toArr(child),
      });
    }
    return arr;
  }
  return toArr(root);
}

async function pool(items, worker, concurrency) {
  const results = new Array(items.length);
  let idx = 0;
  let done = 0;
  async function run() {
    while (idx < items.length) {
      const cur = idx++;
      results[cur] = await worker(items[cur], cur);
      done++;
      if (done % 25 === 0 || done === items.length) {
        process.stdout.write(`  ...processed ${done}/${items.length}\n`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

/** Convert Postman collection v2.1 to endpoint/section records. */
function postmanToRecords(collection, productId) {
  const records = [];
  const rootSlug = productId + "-api-reference";
  records.push({
    slug: rootSlug,
    title: collection.info?.name || "CFTR API Reference",
    kind: "section",
    breadcrumb: [rootSlug],
    markdown: collection.info?.description || "",
  });

  function walk(items, breadcrumb) {
    for (const item of items || []) {
      if (item.item) {
        const sectionSlug = [...breadcrumb, slugify(item.name)].join("/");
        records.push({
          slug: sectionSlug,
          title: item.name,
          kind: "section",
          breadcrumb: sectionSlug.split("/"),
          markdown: item.description || "",
        });
        walk(item.item, sectionSlug.split("/"));
      } else if (item.request) {
        const slug = [...breadcrumb, slugify(item.name)].join("/");
        const req = item.request;
        const method = (req.method || "GET").toUpperCase();
        const urlRaw = typeof req.url === "string" ? req.url : req.url?.raw || "";
        const parsed = parsePostmanUrl(urlRaw);
        const pathStr = parsed.path;
        const query = [
          ...parsed.query,
          ...(req.url?.query || []).map((q) => ({
            name: q.key,
            description: q.description,
            isRequired: !q.disabled,
            value: q.value || "",
            valueType: "string",
          })),
        ];
        const pathFields = parsed.pathParams;
        const headers = (req.header || []).map((h) => ({
          name: h.key,
          description: h.description,
          isRequired: !h.disabled,
          value: h.value || "",
          valueType: "string",
        }));
        let bodyFields = [];
        if (req.body?.mode === "raw" && req.body.raw) {
          try {
            const parsed = JSON.parse(req.body.raw);
            bodyFields = objectToParamFields(parsed);
          } catch {
            bodyFields = [{ name: "body", value: req.body.raw, valueType: "string" }];
          }
        }
        records.push({
          slug,
          title: item.name,
          kind: "endpoint",
          breadcrumb: slug.split("/"),
          description: item.description || item.name,
          method,
          path: pathStr,
          request: {
            query,
            header: headers,
            body: bodyFields,
            path: pathFields,
            contentType: "application/json",
          },
          responses: [],
        });
      }
    }
  }

  walk(collection.item, [rootSlug]);
  return records;
}

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parsePostmanUrl(urlRaw) {
  const embeddedQuery = [];
  const pathParamNames = [];
  let s = String(urlRaw || "").trim();
  s = s.replace(/^\{\{base_url\}\}\/?/i, "");

  const qIdx = s.indexOf("?");
  if (qIdx !== -1) {
    const qs = s.slice(qIdx + 1);
    s = s.slice(0, qIdx);
    for (const part of qs.split("&")) {
      const eq = part.indexOf("=");
      const name = (eq === -1 ? part : part.slice(0, eq)).trim();
      const val = eq === -1 ? "" : part.slice(eq + 1).trim();
      if (!name) continue;
      if (["AccessID", "Signature", "Expires"].includes(name)) continue;
      if (val && !/^\{\{/.test(val)) {
        embeddedQuery.push({ name, value: decodeURIComponent(val), valueType: "string" });
      }
    }
  }

  s = s.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
    pathParamNames.push(name);
    return `{${name}}`;
  });
  s = s.replace(/\{\{([^}]+)\}\}/g, () => "");

  s = s.replace(/\/+/g, "/");
  if (!s.startsWith("/")) s = `/${s}`;

  const pathParams = pathParamNames.map((name) => ({
    name,
    value: "",
    valueType: "string",
  }));

  return { path: s, query: embeddedQuery, pathParams };
}

function extractPostmanPath(urlRaw) {
  return parsePostmanUrl(urlRaw).path;
}

function objectToParamFields(obj, prefix = "") {
  const fields = [];
  for (const [key, val] of Object.entries(obj)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === "object" && !Array.isArray(val)) {
      fields.push(...objectToParamFields(val, name));
    } else {
      fields.push({
        name: key,
        value: Array.isArray(val) ? JSON.stringify(val) : String(val ?? ""),
        valueType: Array.isArray(val) ? "array" : typeof val,
      });
    }
  }
  return fields;
}

async function ingestTheneo(product, dirs) {
  const INDEX_URL = `${product.docsOrigin}/${product.docsProject}/llms.txt`;
  console.log(`Fetching index: ${INDEX_URL}`);
  const indexText = await fetchText(INDEX_URL, product);
  let entries = parseIndex(indexText, product.docsProject);
  if (MAX_CRAWL_PAGES < entries.length) {
    console.log(`Limiting to ${MAX_CRAWL_PAGES} pages (MAX_CRAWL_PAGES)`);
    entries = entries.slice(0, MAX_CRAWL_PAGES);
  }
  console.log(`Found ${entries.length} pages in index.`);

  await rm(dirs.pagesDir, { recursive: true, force: true });
  await mkdir(dirs.pagesDir, { recursive: true });

  const records = await pool(
    entries,
    async (entry) => {
      let html;
      try {
        html = await fetchText(entry.url, product);
      } catch (err) {
        console.warn(`  ! failed ${entry.slug}: ${err.message}`);
        return {
          slug: entry.slug,
          title: entry.title,
          kind: "section",
          breadcrumb: entry.slug.split("/"),
          markdown: entry.indexDescription || "",
          failed: true,
        };
      }
      const pre = extractPre(html);
      const endpoint = parseEndpoint(pre);
      if (endpoint) {
        const spec = endpoint.spec;
        return {
          slug: entry.slug,
          title: entry.title,
          kind: "endpoint",
          breadcrumb: entry.slug.split("/"),
          description: cleanProse(endpoint.description),
          method: (spec.endpoints.method || "GET").toUpperCase(),
          path: spec.endpoints.path || "",
          request: spec.request || {},
          responses: spec.responses || [],
          dataExample: spec.dataExample || [],
          endpointSummary: spec.endpointSummary || [],
          contentType: spec.request?.contentType || "application/json",
        };
      }
      return {
        slug: entry.slug,
        title: entry.title,
        kind: "section",
        breadcrumb: entry.slug.split("/"),
        markdown: cleanProse(pre) || entry.indexDescription || "",
      };
    },
    CONCURRENCY
  );

  return records;
}

async function ingestPostman(product, dirs, collectionFile = "", parser = "js") {
  let raw;
  let collectionPath = collectionFile;
  if (collectionFile) {
    console.log(`Reading Postman collection file: ${collectionFile}`);
    raw = await readFile(collectionFile, "utf8");
  } else {
    console.log(`Fetching Postman collection: ${product.postmanCollectionUrl}`);
    raw = await fetchText(product.postmanCollectionUrl, product);
    const tmpDir = path.join(ROOT, ".tmp");
    await mkdir(tmpDir, { recursive: true });
    collectionPath = path.join(tmpDir, `${product.productId}-collection-${Date.now()}.json`);
    await writeFile(collectionPath, raw, "utf8");
  }
  const collection = JSON.parse(raw);
  let records;
  if (parser === "ts") {
    console.log("Using TypeScript Postman parser (postman-ts-parse-cli.ts)…");
    records = await postmanToRecordsWithTs(collectionPath, product.productId);
  } else {
    records = postmanToRecords(collection, product.productId);
  }
  console.log(`Parsed ${records.length} pages from Postman collection (${parser} parser).`);

  await rm(dirs.pagesDir, { recursive: true, force: true });
  await mkdir(dirs.pagesDir, { recursive: true });
  return records;
}

async function main() {
  const { productId, delay, collectionFile, parser } = parseArgs();
  const product = getProductConfig(productId);
  const outputRoot = process.env.INGEST_OUTPUT_ROOT?.trim() || ROOT;
  const dirs = contentDirForProduct(outputRoot, product);

  if (delay > 0) await new Promise((r) => setTimeout(r, delay));

  let records;
  if (product.docsSourceType === "postman" || collectionFile) {
    records = await ingestPostman(product, dirs, collectionFile, parser);
  } else {
    records = await ingestTheneo(product, dirs);
  }

  for (const rec of records) {
    const file = path.join(dirs.pagesDir, fileNameForSlug(rec.slug));
    await writeFile(file, JSON.stringify(rec, null, 2), "utf8");
  }

  const nav = buildNav(records);
  const endpoints = records.filter((r) => r.kind === "endpoint").length;
  const manifest = {
    productId: product.productId,
    productName: product.productName,
    project: product.docsProject,
    origin: product.docsOrigin,
    generatedAt: new Date().toISOString(),
    count: records.length,
    defaultBaseUrl: product.defaultBaseUrl,
    indexed: true,
    pages: records.map((r) => ({
      slug: r.slug,
      title: r.title,
      kind: r.kind,
      method: r.method || null,
    })),
    nav,
  };

  await mkdir(path.dirname(dirs.manifestPath), { recursive: true });
  await writeFile(dirs.manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  console.log(
    `\n[${productId}] Done. ${records.length} pages (${endpoints} endpoints, ${records.length - endpoints} sections).`
  );
  console.log(`Wrote ${dirs.pagesDir}`);
  console.log(`Wrote ${dirs.manifestPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
