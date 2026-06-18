#!/usr/bin/env node
/**
 * Cross-checks the retrieval-recall harness against the REAL /api/agent planner.
 * Replays a stratified sample of generated prompts through the running agent and
 * reports whether the target endpoint appears in the planned steps or retrieval.
 *
 * Requires the dev server running (default http://localhost:3000).
 * Usage: node scripts/validate-agent-sample.mjs [baseUrl]
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const BASE = process.argv[2] || "https://intel-exchange-runnable-docs.vercel.app";

// Known duplicate endpoints (same title + method, different slug): retrieving
// the twin is a functional pass.
const DUP_TWINS = {
  "threat-data/list-threat-data": "threat-investigation/threat-data/list-threat-data-1",
  "threat-investigation/threat-data/list-threat-data-1": "threat-data/list-threat-data",
  "rss-feeds/iocs-listing-1": "threat-mailbox/iocs-listing",
  "threat-mailbox/iocs-listing": "rss-feeds/iocs-listing-1",
};

async function callAgent(query) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 55000);
  try {
    const res = await fetch(`${BASE}/api/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, mode: "workflow" }),
      signal: ac.signal,
    });
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  } finally {
    clearTimeout(t);
  }
}

function stratifiedSample(results, perSection = 1) {
  const bySection = new Map();
  for (const r of results) {
    const sec = r.slug.split("/")[0];
    if (!bySection.has(sec)) bySection.set(sec, []);
    bySection.get(sec).push(r);
  }
  const out = [];
  for (const [, arr] of bySection) {
    for (let i = 0; i < perSection && i < arr.length; i++) {
      out.push(arr[Math.floor((i + 1) * arr.length / (perSection + 1))]);
    }
  }
  return out;
}

async function main() {
  const data = JSON.parse(
    await readFile(path.join(ROOT, "test-results", "endpoint-coverage.json"), "utf8")
  );
  const results = data.results;
  const misses = results.filter((r) => r.rank === null);
  const sample = [...stratifiedSample(results, 1), ...misses];
  // de-dup by slug
  const seen = new Set();
  const cases = sample.filter((c) => (seen.has(c.slug) ? false : seen.add(c.slug)));

  console.log(`Validating ${cases.length} prompts against ${BASE}/api/agent (full planner)…\n`);
  let pass = 0;
  const rows = [];
  for (const c of cases) {
    try {
      const r = await callAgent(c.prompt);
      const stepSlugs = (r.steps || []).map((s) => s.slug);
      const retrSlugs = (r.retrieval || []).map((s) => s.slug);
      const twin = DUP_TWINS[c.slug];
      const inSteps = stepSlugs.includes(c.slug) || (twin && stepSlugs.includes(twin));
      const inRetr = retrSlugs.includes(c.slug) || (twin && retrSlugs.includes(twin));
      const ok = inSteps || inRetr;
      if (ok) pass++;
      const tag = inSteps ? "STEP" : inRetr ? "RETR" : "MISS";
      console.log(`[${tag}] ${c.slug}`);
      console.log(`   prompt : "${c.prompt}"`);
      console.log(`   steps  : ${stepSlugs.join(", ") || "(none)"}`);
      console.log(`   conf   : ${r.confidence}\n`);
      rows.push({ slug: c.slug, prompt: c.prompt, tag, steps: stepSlugs, confidence: r.confidence });
    } catch (e) {
      console.log(`[ERR ] ${c.slug} — ${e.message}\n`);
      rows.push({ slug: c.slug, prompt: c.prompt, tag: "ERR", error: e.message });
    }
  }
  console.log("=========================================");
  console.log(`Planner sample: ${pass}/${cases.length} target endpoint in steps or retrieval`);
  console.log("=========================================");
}

main().catch((e) => {
  console.error(e?.stack || e?.message || e);
  process.exit(1);
});
