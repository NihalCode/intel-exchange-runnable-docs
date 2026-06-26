#!/usr/bin/env node
/**
 * End-to-end test of snippet behavior against the live CTIX tenant.
 * Replicates the app's resolve logic: drop empty optional params + inject auth.
 *
 * Usage:
 *   node scripts/test-snippets.mjs
 *
 * Credentials (required — never hardcoded):
 *   CTIX_ACCESS_ID, CTIX_SECRET_KEY in .env.local / shell env, or
 *   CYWARE KEYS.txt (see .gitignore) via CYWARE_KEYS_FILE or ~/Downloads/CYWARE KEYS.txt
 */

import crypto from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function loadKeys() {
  const paths = [
    process.env.CYWARE_KEYS_FILE,
    join(homedir(), "Downloads", "CYWARE KEYS.txt"),
  ].filter(Boolean);

  let accessId = process.env.CTIX_ACCESS_ID?.trim();
  let secretKey = process.env.CTIX_SECRET_KEY?.trim();

  for (const p of paths) {
    if (!existsSync(p)) continue;
    const text = readFileSync(p, "utf8");
    accessId ||= text.match(/Access ID:\s*(\S+)/i)?.[1];
    secretKey ||= text.match(/SECRET KEY:\s*(\S+)/i)?.[1];
    break;
  }

  return { accessId, secretKey };
}

const BASE = (process.env.CTIX_BASE_URL || "https://cs-testv2.cyware.com/ctixapi").replace(/\/+$/, "");
const { accessId: ACCESS_ID, secretKey: SECRET_KEY } = loadKeys();

if (!ACCESS_ID || !SECRET_KEY) {
  console.error(
    "Missing CTIX credentials. Set CTIX_ACCESS_ID and CTIX_SECRET_KEY in .env.local, " +
      "or place CYWARE KEYS.txt in Downloads (gitignored)."
  );
  process.exit(1);
}

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
    if (v === undefined || v === null || String(v).trim() === "") continue;
    u.searchParams.set(k, String(v));
  }
  u.searchParams.set("AccessID", ACCESS_ID);
  u.searchParams.set("Signature", signature);
  u.searchParams.set("Expires", String(expires));
  return u.toString();
}

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
