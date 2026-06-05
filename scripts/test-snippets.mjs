#!/usr/bin/env node
/**
 * End-to-end test of snippet behavior against the live CTIX tenant.
 * Replicates the app's resolve logic: drop empty optional params + inject auth.
 *
 * Usage:
 *   node scripts/test-snippets.mjs
 * Reads credentials from env or Downloads/CYWARE KEYS.txt.
 */

import crypto from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE = (process.env.CTIX_BASE_URL || "https://cs-testv2.cyware.com/ctixapi").replace(/\/+$/, "");

const ACCESS_ID = process.env.CTIX_ACCESS_ID || "REDACTED_CTIX_ACCESS_ID";
const SECRET_KEY = process.env.CTIX_SECRET_KEY || "REDACTED_CTIX_SECRET_KEY";

function sign() {
  const expires = Math.floor(Date.now() / 1000) + 20;
  const signature = crypto
    .createHmac("sha1", SECRET_KEY)
    .update(`${ACCESS_ID}\n${expires}`)
    .digest("base64");
  return { expires, signature };
}

/** Replace `{name}` in path templates (mirrors applyPathParams). */
function resolvePath(template, pathParams = {}) {
  let out = template.startsWith("/") ? template : `/${template}`;
  for (const [name, value] of Object.entries(pathParams)) {
    if (!value || String(value).trim() === "") continue;
    out = out.replaceAll(`{${name}}`, encodeURIComponent(String(value).trim()));
  }
  return out;
}

/** Build a request URL the way the app does: drop empty params, inject fresh auth. */
function buildUrl(path, query = {}, pathParams = {}) {
  const { expires, signature } = sign();
  const u = new URL(BASE + resolvePath(path, pathParams));
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || String(v).trim() === "") continue; // drop empties
    u.searchParams.set(k, String(v));
  }
  u.searchParams.set("AccessID", ACCESS_ID);
  u.searchParams.set("Signature", signature);
  u.searchParams.set("Expires", String(expires));
  return u.toString();
}

// Each case mirrors a snippet the UI generates. Empty optional params included
// on purpose to prove they get dropped (the old 400 bug).
const cases = [
  { name: "Ping (no params)", method: "GET", path: "/ping/", query: {} },
  {
    name: "Feed sources collection (empty optional params)",
    method: "GET",
    path: "/conversion/feed-sources/collection/",
    query: { source: "", category: "", page: "", page_size: "", sort: "" },
  },
  {
    name: "List custom attributes",
    method: "GET",
    path: "/ingestion/configuration/custom-attribute/",
    query: { sort: "ctix_modified", page_size: "5" },
  },
];

// Dynamic: retrieve using a real ID from the list endpoint
{
  const listUrl = buildUrl("/ingestion/configuration/custom-attribute/", { page_size: "1" });
  const listRes = await fetch(listUrl);
  const list = await listRes.json();
  const realId = list.results?.[0]?.id;
  if (realId) {
    cases.push({
      name: "Get custom attribute by real ID (path param)",
      method: "GET",
      path: "/ingestion/configuration/custom-attribute/{custom_attribute_id}/",
      pathParams: { custom_attribute_id: realId },
      query: {},
    });
  }
}

let failures = 0;
for (const c of cases) {
  const url = buildUrl(c.path, c.query, c.pathParams ?? {});
  const safeUrl = url.replace(SECRET_KEY, "***").replace(/Signature=[^&]+/, "Signature=***");
  if (url.includes("{")) {
    failures++;
    console.log(`\n[FAIL] ${c.name}: unresolved path placeholder in ${safeUrl}`);
    continue;
  }
  try {
    const started = Date.now();
    const res = await fetch(url, { method: c.method });
    const text = await res.text();
    const ms = Date.now() - started;
    const ok =
      (res.status >= 200 && res.status < 300) ||
      (c.allow404 && res.status === 404);
    if (!ok) failures++;
    console.log(`\n[${ok ? "PASS" : "FAIL"}] ${c.name}`);
    console.log(`  ${c.method} ${safeUrl}`);
    console.log(`  ${res.status} (${ms}ms): ${text.slice(0, 200).replace(/\s+/g, " ")}`);
  } catch (e) {
    failures++;
    console.log(`\n[FAIL] ${c.name}: ${e.message}`);
  }
}

console.log(`\n${failures === 0 ? "✓ All snippet cases passed" : `✗ ${failures} case(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
