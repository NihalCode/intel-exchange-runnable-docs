#!/usr/bin/env node
/**
 * Endpoint coverage test for the docs agent's RAG retrieval.
 *
 * For every endpoint in agent-index.json this:
 *   1. generates a plain-English ("non-technical") prompt from the title/breadcrumb
 *   2. expands it exactly like the live agent (expandQueryForRetrieval rules)
 *   3. embeds it with OpenAI text-embedding-3-small (512-dim)
 *   4. queries the real Pinecone index for topK=14 (workflow-mode default)
 *   5. records whether the target endpoint was retrieved, and at what rank
 *
 * Output: recall@1/3/5/8/14 + a full per-endpoint CSV/JSON, including misses.
 *
 * Usage: node scripts/test-endpoint-coverage.mjs
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const INDEX_PATH = path.join(ROOT, "src", "content", "agent-index.json");
const OUT_DIR = path.join(ROOT, "test-results");
const CONTROL_PLANE = "https://api.pinecone.io";
const TOP_K = 14;

function loadEnvLocal() {
  const file = path.join(ROOT, ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

/* ---- faithful copy of expandQueryForRetrieval SYNONYM_RULES ---- */
const SYNONYM_RULES = [
  { pattern: /\b(label|labels|category|categories)\b/i, expand: ["tag", "tags"] },
  { pattern: /\b(show|see|view|display|get me|list out|whats|what's|what are)\b/i, expand: ["list"] },
  { pattern: /\b(make|new|add a|create a)\b/i, expand: ["create"] },
  { pattern: /\b(bad|malicious|suspicious|threat|threats|ioc|iocs)\b/i, expand: ["indicator", "threat data"] },
  { pattern: /\b(ip|ips|domain|domains|url|urls|hash|hashes|file)\b/i, expand: ["indicator", "ioc_type"] },
  { pattern: /\b(attach|tag it|apply|put .* on)\b/i, expand: ["bulk add tags", "add_tag"] },
  { pattern: /\b(group|groups|folder|folders)\b/i, expand: ["tag group"] },
  { pattern: /\b(import|upload|bring in|load)\b/i, expand: ["import intel", "stix"] },
  { pattern: /\b(feed|feeds|source|sources|collection|collections)\b/i, expand: ["source collections"] },
  { pattern: /\b(rule|rules|alert|alerts)\b/i, expand: ["rules"] },
  { pattern: /\b(test|check connection|is it working|ping|health)\b/i, expand: ["ping"] },
  { pattern: /\b(delete|remove|get rid of)\b/i, expand: ["delete", "remove"] },
  { pattern: /\b(update|change|edit|rename)\b/i, expand: ["update"] },
  { pattern: /\b(everyone|all of them|all)\b/i, expand: ["bulk"] },
  {
    pattern: /\b(threat\s*mailbox|email\s*(message|feed|source)s?)\b/i,
    expand: ["threat mailbox", "email deep search", "search url"],
  },
  {
    pattern: /\b(report|reports)\b.*\b(download|file|attachment)\b|\b(download|get)\b.*\b(report|intel)\b.*\b(file|attachment)\b/i,
    expand: ["reports download file", "external download", "file_id token"],
  },
];
function expandQueryForRetrieval(query) {
  const extra = new Set();
  for (const rule of SYNONYM_RULES) {
    if (rule.pattern.test(query)) for (const t of rule.expand) extra.add(t);
  }
  if (extra.size === 0) return query;
  return `${query} ${[...extra].join(" ")}`;
}

/* --------------------------- prompt generation --------------------------- */
const ACRONYMS = new Set(["STIX", "TAXII", "IOC", "IOCS", "CSV", "URL", "URLS", "SDO", "SDOS", "TLP", "MISP", "CIDR", "API", "APIS", "CVE", "CQL", "RSS", "DNS", "ID", "IDS", "IP", "IPS", "UUID", "JSON", "PDF", "YARA", "MITRE"]);

function humanizeToken(tok) {
  if (/^[A-Z0-9]{2,}$/.test(tok) && ACRONYMS.has(tok.toUpperCase())) return tok;
  return tok.toLowerCase();
}
function humanizePhrase(phrase) {
  return phrase
    .replace(/[-_]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(humanizeToken)
    .join(" ")
    .trim();
}

const VERB_CATEGORIES = [
  { re: /^(get|list|retrieve|fetch|view|read|show)\b/i, cat: "list" },
  { re: /^(create|add|generate|register|save|submit|post|new)\b/i, cat: "create" },
  { re: /^(update|edit|modify|change|set|rename|patch|replace)\b/i, cat: "update" },
  { re: /^(delete|remove|clear|purge|revoke|unassign|discard)\b/i, cat: "delete" },
  { re: /^(enable|activate)\b/i, cat: "enable" },
  { re: /^(disable|deactivate)\b/i, cat: "disable" },
  { re: /^(export|download)\b/i, cat: "export" },
  { re: /^(import|upload)\b/i, cat: "import" },
  { re: /^(bulk)\b/i, cat: "bulk" },
  { re: /^(mark|unmark|flag)\b/i, cat: "mark" },
  { re: /^(assign)\b/i, cat: "assign" },
  { re: /^(search|query|filter)\b/i, cat: "search" },
  { re: /^(test|ping|check)\b/i, cat: "test" },
  { re: /^(copy|clone|duplicate)\b/i, cat: "copy" },
  { re: /^(validate|verify|confirm)\b/i, cat: "verify" },
];

function pick(arr, seed) {
  return arr[seed % arr.length];
}

/** Layperson prompts for endpoints whose titles are ambiguous without parent context. */
const VAGUE_ENDPOINT_PROMPTS = {
  "threat-mailbox/search-url": [
    "search for a link in my threat mailbox emails",
    "find a url in email messages in the threat mailbox",
  ],
  "reports/download-file": [
    "download a report file i was sent",
    "get the report file with my download link",
  ],
};

/** Produce a casual, non-technical prompt that targets this endpoint. */
function generatePrompt(chunk, seed) {
  const vague = VAGUE_ENDPOINT_PROMPTS[chunk.slug];
  if (vague) return pick(vague, seed);

  const title = (chunk.title || "").trim();
  const bc = Array.isArray(chunk.breadcrumb) ? chunk.breadcrumb : [];
  // Parent context = breadcrumb minus the last node (often == title-ish).
  const parent = bc.length > 1 ? humanizePhrase(bc[bc.length - 2]) : "";

  let cat = "generic";
  let rest = title;
  for (const v of VERB_CATEGORIES) {
    if (v.re.test(title)) {
      cat = v.cat;
      rest = title.replace(v.re, "").trim();
      break;
    }
  }
  // For "bulk", keep the bulk word in the phrase.
  if (cat === "bulk") rest = title;

  let phrase = humanizePhrase(rest);
  const trailingList = /\blist$/i.test(phrase);
  if (trailingList) phrase = phrase.replace(/\s*\blist$/i, "").trim();

  // Disambiguate generic/short phrases with the parent breadcrumb (avoid
  // duplicating words already present in the phrase).
  const wordCount = phrase.split(/\s+/).filter(Boolean).length;
  if ((wordCount <= 1 || /^(details?|info|list|configuration|settings?)$/i.test(phrase)) && parent) {
    const phraseWords = new Set(phrase.split(/\s+/));
    const parentTrimmed = parent
      .split(/\s+/)
      .filter((w) => !phraseWords.has(w))
      .join(" ")
      .trim();
    phrase = `${parentTrimmed} ${phrase}`.trim();
  }
  if (!phrase) phrase = parent || humanizePhrase(title);

  const A = (s) => /^[aeiou]/i.test(s) ? "an" : "a";

  switch (cat) {
    case "list":
      if (trailingList) return pick([`show me the list of ${phrase}`, `can you show me all the ${phrase}`, `i want to see the ${phrase}`], seed);
      if (/details?$/i.test(phrase)) return pick([`show me the ${phrase}`, `can you pull up the ${phrase}`], seed);
      return pick([`show me the ${phrase}`, `i want to see the ${phrase}`, `can you get the ${phrase} for me`], seed);
    case "create":
      return pick([`i want to create ${A(phrase)} ${phrase}`, `make ${A(phrase)} new ${phrase}`, `create ${A(phrase)} ${phrase}`], seed);
    case "update":
      return pick([`i need to update ${A(phrase)} ${phrase}`, `change ${A(phrase)} ${phrase}`, `edit ${A(phrase)} ${phrase}`], seed);
    case "delete":
      return pick([`delete ${A(phrase)} ${phrase}`, `i want to remove ${A(phrase)} ${phrase}`, `get rid of ${A(phrase)} ${phrase}`], seed);
    case "enable":
      return pick([`turn on ${phrase}`, `enable ${phrase}`], seed);
    case "disable":
      return pick([`turn off ${phrase}`, `disable ${phrase}`], seed);
    case "export":
      return pick([`download the ${phrase}`, `export the ${phrase}`], seed);
    case "import":
      return pick([`upload ${phrase}`, `import ${phrase}`, `bring in ${phrase}`], seed);
    case "bulk":
      return pick([`i want to ${phrase}`, `do a ${phrase}`], seed);
    case "mark":
      return pick([`mark ${phrase}`, `i want to flag ${phrase}`], seed);
    case "assign":
      return pick([`assign ${phrase}`, `i want to assign ${phrase}`], seed);
    case "search":
      return pick([`search the ${phrase}`, `find ${phrase}`], seed);
    case "test":
      return pick([`check if ${phrase} is working`, `test the ${phrase}`], seed);
    case "copy":
      return pick([`make a copy of ${A(phrase)} ${phrase}`, `clone ${A(phrase)} ${phrase}`], seed);
    case "verify":
      return pick([`verify the ${phrase}`, `check the ${phrase}`], seed);
    default:
      return pick([`i want to ${humanizePhrase(title)}`, `help me ${humanizePhrase(title)}`], seed);
  }
}

/* ------------------------------- OpenAI ------------------------------- */
async function embedBatch(texts, apiKey) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", input: texts, dimensions: 512 }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).data.map((d) => d.embedding);
}

/* ------------------------------ Pinecone ------------------------------ */
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
async function resolveHost(cfg) {
  const r = await pc(`${CONTROL_PLANE}/indexes/${cfg.indexName}`, cfg.apiKey);
  if (!r.ok) throw new Error(`describe index ${r.status}`);
  return (await r.json()).host;
}
async function queryTopK(host, apiKey, vector) {
  const r = await pc(`https://${host}/query`, apiKey, {
    method: "POST",
    body: JSON.stringify({ vector, topK: TOP_K, includeMetadata: true, includeValues: false }),
  });
  if (!r.ok) throw new Error(`query ${r.status}`);
  return (await r.json()).matches ?? [];
}

async function pool(items, size, worker) {
  const out = new Array(items.length);
  let i = 0;
  async function run() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: size }, run));
  return out;
}

async function main() {
  loadEnvLocal();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const cfg = {
    apiKey: process.env.PINECONE_API_KEY?.trim(),
    indexName: process.env.PINECONE_INDEX?.trim() || "intel-exchange-docs",
  };
  if (!openaiKey) throw new Error("OPENAI_API_KEY required");
  if (!cfg.apiKey) throw new Error("PINECONE_API_KEY required");

  const index = JSON.parse(await readFile(INDEX_PATH, "utf8"));
  const endpoints = index.chunks.filter((c) => c.id.endsWith("::endpoint"));

  // 1) generate prompts
  const cases = endpoints.map((c, i) => {
    const prompt = generatePrompt(c, i);
    return {
      id: c.id,
      slug: c.slug,
      title: c.title,
      method: c.method,
      path: c.path,
      prompt,
      retrievalQuery: expandQueryForRetrieval(prompt),
    };
  });

  if (process.argv.includes("--dry")) {
    const sample = process.argv.includes("--all") ? cases : cases.slice(0, 40);
    for (const c of sample) console.log(`[${c.method}] ${c.title}\n   -> "${c.prompt}"`);
    console.log(`\n(${cases.length} total prompts generated; dry run, no network)`);
    return;
  }

  console.log(`Testing ${endpoints.length} endpoints (topK=${TOP_K})…`);

  // 2) embed in batches
  const host = await resolveHost(cfg);
  const B = 64;
  const embeddings = [];
  for (let i = 0; i < cases.length; i += B) {
    const batch = cases.slice(i, i + B);
    const vecs = await embedBatch(batch.map((c) => c.retrievalQuery), openaiKey);
    embeddings.push(...vecs);
    process.stdout.write(`  embedded ${Math.min(i + B, cases.length)}/${cases.length}\r`);
  }
  console.log("");

  // 3) query Pinecone with a small concurrency pool
  let done = 0;
  const results = await pool(cases, 8, async (c, idx) => {
    const matches = await queryTopK(host, cfg.apiKey, embeddings[idx]);
    const rank = matches.findIndex((m) => m.id === c.id);
    done++;
    if (done % 25 === 0) process.stdout.write(`  queried ${done}/${cases.length}\r`);
    return {
      ...c,
      rank: rank < 0 ? null : rank + 1,
      top1: matches[0]?.metadata?.slug ?? matches[0]?.id ?? "",
      top3: matches.slice(0, 3).map((m) => m.metadata?.slug ?? m.id),
    };
  });
  console.log("");

  // 4) aggregate
  const within = (k) => results.filter((r) => r.rank !== null && r.rank <= k).length;
  const n = results.length;
  const summary = {
    total: n,
    recall_at_1: within(1),
    recall_at_3: within(3),
    recall_at_5: within(5),
    recall_at_8: within(8),
    recall_at_14: within(14),
    misses: results.filter((r) => r.rank === null).length,
  };
  const pct = (x) => `${((x / n) * 100).toFixed(1)}%`;

  console.log("\n================ ENDPOINT COVERAGE ================");
  console.log(`Total endpoints tested : ${n}`);
  console.log(`Recall@1               : ${summary.recall_at_1} (${pct(summary.recall_at_1)})`);
  console.log(`Recall@3               : ${summary.recall_at_3} (${pct(summary.recall_at_3)})`);
  console.log(`Recall@5               : ${summary.recall_at_5} (${pct(summary.recall_at_5)})`);
  console.log(`Recall@8               : ${summary.recall_at_8} (${pct(summary.recall_at_8)})`);
  console.log(`Recall@14 (agent topK) : ${summary.recall_at_14} (${pct(summary.recall_at_14)})`);
  console.log(`Not retrieved (misses) : ${summary.misses} (${pct(summary.misses)})`);
  console.log("===================================================\n");

  // 5) write outputs
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(
    path.join(OUT_DIR, "endpoint-coverage.json"),
    JSON.stringify({ summary, results }, null, 2)
  );
  const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const csv = [
    "slug,method,path,prompt,rank,top1",
    ...results.map((r) => [esc(r.slug), esc(r.method), esc(r.path), esc(r.prompt), r.rank ?? "MISS", esc(r.top1)].join(",")),
  ].join("\n");
  await writeFile(path.join(OUT_DIR, "endpoint-coverage.csv"), csv);

  const misses = results.filter((r) => r.rank === null);
  if (misses.length) {
    console.log(`MISSES (${misses.length}) — endpoint not in top ${TOP_K}:`);
    for (const m of misses.slice(0, 60)) {
      console.log(`  [${m.method}] ${m.slug}`);
      console.log(`      prompt: "${m.prompt}"`);
      console.log(`      got:    ${m.top3.join(", ")}`);
    }
    if (misses.length > 60) console.log(`  …and ${misses.length - 60} more (see CSV/JSON).`);
  }
  console.log(`\nFull results: test-results/endpoint-coverage.{json,csv}`);
}

main().catch((e) => {
  console.error("\n" + (e?.stack || e?.message || e));
  process.exit(1);
});
