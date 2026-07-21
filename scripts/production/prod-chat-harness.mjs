#!/usr/bin/env node
/**
 * Authenticated production chat harness scaffold.
 *
 * Requires operator-supplied session material (never commit secrets):
 *   PROD_CHAT_COOKIE   — Auth0 session cookie header value
 *   PROD_CHAT_CSRF     — x-csrf-token matching cookie
 *   PROD_CHAT_ORIGIN   — Origin header (canonical product host)
 *
 * Without credentials this script exits 0 with status BLOCKED and writes
 * artifacts documenting the gap (Wave D).
 *
 * Usage:
 *   node scripts/production/prod-chat-harness.mjs
 *   node scripts/production/prod-chat-harness.mjs --product=ctix
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const OUT_DIR = path.join(ROOT, "artifacts", "chat-accuracy");
const OUT_PATH = path.join(OUT_DIR, "prod-chat-harness-report.json");

const BASES = {
  ctix: "https://apitest1.cyninjadev.com",
  cftr: "https://cyware-docs-cftr.vercel.app",
  csap: "https://cyware-docs-csap.vercel.app",
  orchestrate: "https://cyware-docs-orchestrate.vercel.app",
};

const CRITICAL = [
  { id: "auth-explain", prompt: "How does Open API authentication work?" },
  { id: "snippet-curl", prompt: "Give me a curl example for the connectivity or ping endpoint" },
  { id: "no-code", prompt: "Explain pagination conceptually — no code" },
  { id: "no-invent", prompt: "Delete everything with one undocumented API call" },
];

function argValue(name) {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : null;
}

async function postAgent(baseUrl, prompt, cookie, csrf, origin) {
  const res = await fetch(`${baseUrl}/api/agent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie,
      "x-csrf-token": csrf,
      origin,
    },
    body: JSON.stringify({ query: prompt, mode: "workflow" }),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return {
    status: res.status,
    ok: res.ok,
    hasWorkflow: Boolean(json?.workflow || json?.plan || json?.steps),
    requestId: res.headers.get("x-request-id") || json?.requestId || null,
    redactedPreview: String(json?.workflow || text).slice(0, 240).replace(/signature=[^&\s]+/gi, "Signature=***"),
  };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const productFilter = argValue("--product");
  const cookie = process.env.PROD_CHAT_COOKIE?.trim();
  const csrf = process.env.PROD_CHAT_CSRF?.trim();
  const products = productFilter
    ? [productFilter]
    : Object.keys(BASES);

  if (!cookie || !csrf) {
    const report = {
      generatedAt: new Date().toISOString(),
      status: "BLOCKED",
      reason:
        "Missing PROD_CHAT_COOKIE / PROD_CHAT_CSRF — authenticated production chat scoring deferred (Wave D).",
      products: products.map((p) => ({ product: p, baseUrl: BASES[p], status: "BLOCKED" })),
      localHarness: "Use npm run chat:accuracy for deterministic offline scoring.",
    };
    writeFileSync(OUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(report, null, 2));
    console.log(`\nWrote ${path.relative(ROOT, OUT_PATH)} (BLOCKED — no credentials)`);
    process.exit(0);
  }

  const results = [];
  for (const product of products) {
    const baseUrl = BASES[product];
    if (!baseUrl) continue;
    const origin = process.env.PROD_CHAT_ORIGIN?.trim() || baseUrl;
    for (const test of CRITICAL) {
      try {
        const outcome = await postAgent(baseUrl, test.prompt, cookie, csrf, origin);
        results.push({
          product,
          ...test,
          ...outcome,
          status: outcome.ok && outcome.hasWorkflow ? "PASS" : "FAIL",
        });
      } catch (error) {
        results.push({
          product,
          ...test,
          status: "FAIL",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const failed = results.filter((r) => r.status === "FAIL").length;
  const report = {
    generatedAt: new Date().toISOString(),
    status: failed ? "NOT_READY" : "PASS",
    totals: { total: results.length, failed, passed: results.length - failed },
    results,
  };
  writeFileSync(OUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
