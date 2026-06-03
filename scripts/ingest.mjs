// Ingestion script: pulls the published Theneo ".md" export for the
// Intel Exchange API reference and vendors it locally as structured JSON.
//
// Source of truth: https://ctixapiv3.cyware.com/intel-exchange-api-reference/llms.txt
// indexes ~527 per-page ".md" files. Each file is an HTML wrapper whose <pre>
// contains either:
//   - an endpoint spec (description + JSON), or
//   - section prose (Markdown with <CodeBlock>/<CodeLine> custom tags).
//
// Run with: npm run ingest

import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ORIGIN = "https://ctixapiv3.cyware.com";
const PROJECT = "intel-exchange-api-reference";
const INDEX_URL = `${ORIGIN}/${PROJECT}/llms.txt`;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CONTENT_DIR = path.join(ROOT, "src", "content");
const PAGES_DIR = path.join(CONTENT_DIR, "pages");

const CONCURRENCY = 12;

/** Single-pass HTML entity decode (named + numeric). */
function decodeEntities(input) {
  if (!input) return "";
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    "#39": "'",
  };
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, body) => {
    if (body[0] === "#") {
      const isHex = body[1] === "x" || body[1] === "X";
      const code = parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (Number.isFinite(code)) return String.fromCodePoint(code);
      return m;
    }
    const key = body.toLowerCase();
    return key in named ? named[key] : m;
  });
}

/** Extract inner text of the single <pre> block of an exported page. */
function extractPre(html) {
  const m = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  if (!m) return "";
  return decodeEntities(m[1]);
}

/** Convert <CodeBlock>..<CodeLine>..</CodeLine>..</CodeBlock> into fenced code. */
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
        } catch {
          /* ignore malformed attribute json */
        }
      }
      const lines = [];
      const lineRe = /<CodeLine>([\s\S]*?)<\/CodeLine>/g;
      let lm;
      while ((lm = lineRe.exec(inner)) !== null) {
        // CodeLine content is encoded one extra level.
        lines.push(decodeEntities(lm[1]));
      }
      const code = lines.join("\n").replace(/\s+$/g, "");
      return `\n\n\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
    }
  );
}

/** Convert <Callout ...>..<p>..</p>..</Callout> into a markdown blockquote. */
function convertCallouts(md) {
  return md.replace(
    /<Callout\b[^>]*>([\s\S]*?)<\/Callout>/g,
    (full, inner) => {
      const text = inner
        .replace(/<\/p>\s*<p>/g, "\n")
        .replace(/<\/?[a-zA-Z][^>]*>/g, "")
        .trim();
      if (!text) return "";
      const quoted = text
        .split("\n")
        .map((l) => `> ${l.trim()}`)
        .join("\n");
      return `\n\n> [!NOTE]\n${quoted}\n\n`;
    }
  );
}

/** Strip residual inline HTML tags (e.g. <span style=...>) but keep text. */
function stripInlineHtml(md) {
  // Protect fenced code regions from tag stripping.
  const parts = md.split(/(```[\s\S]*?```)/g);
  return parts
    .map((part) => {
      if (part.startsWith("```")) return part;
      return part.replace(/<\/?[a-zA-Z][^>]*>/g, "");
    })
    .join("");
}

/** Normalize prose: code blocks -> fences, callouts -> blockquotes, drop html. */
function cleanProse(text) {
  return stripInlineHtml(convertCallouts(convertCodeBlocks(text))).trim();
}

/** Try to split an endpoint page into { description, spec }. */
function parseEndpoint(preText) {
  const braceIdx = preText.indexOf("\n{");
  if (braceIdx === -1) return null;
  const description = preText.slice(0, braceIdx).trim();
  const jsonText = preText.slice(braceIdx + 1);
  try {
    const spec = JSON.parse(jsonText);
    if (spec && spec.endpoints && spec.endpoints.method) {
      return { description, spec };
    }
  } catch {
    /* not an endpoint json */
  }
  return null;
}

function slugFromUrl(url) {
  const u = new URL(url);
  let p = u.pathname;
  const marker = `/${PROJECT}/`;
  const i = p.indexOf(marker);
  if (i !== -1) p = p.slice(i + marker.length);
  return p.replace(/\.md$/i, "");
}

function fileNameForSlug(slug) {
  return slug.replace(/\//g, "__") + ".json";
}

async function fetchText(url, tries = 3) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html,text/plain,*/*" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt === tries) throw err;
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
}

function parseIndex(text) {
  const entries = [];
  const seen = new Set();
  const re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+?\.md)\)\s*:?\s*([^\n]*)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const title = m[1].trim();
    const url = m[2].trim();
    const desc = (m[3] || "").trim();
    const slug = slugFromUrl(url);
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
      if (!node.children.has(key)) {
        node.children.set(key, { slug: key, children: new Map() });
      }
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
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, run);
  await Promise.all(runners);
  return results;
}

async function main() {
  console.log("Fetching index:", INDEX_URL);
  const indexText = await fetchText(INDEX_URL);
  const entries = parseIndex(indexText);
  console.log(`Found ${entries.length} pages in index.`);

  await rm(PAGES_DIR, { recursive: true, force: true });
  await mkdir(PAGES_DIR, { recursive: true });

  const records = await pool(
    entries,
    async (entry) => {
      let html;
      try {
        html = await fetchText(entry.url);
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
          contentType:
            (spec.request && spec.request.contentType) || "application/json",
        };
      }
      const md = cleanProse(pre);
      return {
        slug: entry.slug,
        title: entry.title,
        kind: "section",
        breadcrumb: entry.slug.split("/"),
        markdown: md || entry.indexDescription || "",
      };
    },
    CONCURRENCY
  );

  for (const rec of records) {
    const file = path.join(PAGES_DIR, fileNameForSlug(rec.slug));
    await writeFile(file, JSON.stringify(rec, null, 2), "utf8");
  }

  const nav = buildNav(records);
  const manifest = {
    project: PROJECT,
    origin: ORIGIN,
    generatedAt: new Date().toISOString(),
    count: records.length,
    defaultBaseUrl: "https://tenantname.com/ctixapi",
    pages: records.map((r) => ({
      slug: r.slug,
      title: r.title,
      kind: r.kind,
      method: r.method || null,
    })),
    nav,
  };
  await writeFile(
    path.join(CONTENT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );

  const endpoints = records.filter((r) => r.kind === "endpoint").length;
  const sections = records.filter((r) => r.kind === "section").length;
  console.log(
    `\nDone. ${records.length} pages (${endpoints} endpoints, ${sections} sections).`
  );
  console.log(`Wrote ${PAGES_DIR}`);
  console.log(`Wrote ${path.join(CONTENT_DIR, "manifest.json")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
