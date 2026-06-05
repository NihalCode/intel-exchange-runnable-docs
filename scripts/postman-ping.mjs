#!/usr/bin/env node
/**
 * Run Ping using Postman collection auth (HMAC-SHA1 + Base64).
 * Reads credentials from CYWARE KEYS.txt or env vars.
 *
 * Usage:
 *   node scripts/postman-ping.mjs [server_url]
 *   node scripts/postman-ping.mjs https://your-tenant.cyware.com/ctixapi/
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

function sign(accessId, secretKey, expiryOffset = 20) {
  const expires = Math.floor(Date.now() / 1000) + expiryOffset;
  const toSign = `${accessId}\n${expires}`;
  const signature = crypto
    .createHmac("sha1", secretKey)
    .update(toSign)
    .digest("base64");
  return { expires, signature };
}

async function ping(serverUrl, accessId, secretKey) {
  const base = serverUrl.replace(/\/+$/, "");
  const { expires, signature } = sign(accessId, secretKey);

  // Postman: {{server_url}}ping/  and Ping OpenAPI with query params
  const url = new URL(`${base}/ping/`);
  url.searchParams.set("AccessID", accessId);
  url.searchParams.set("Signature", signature);
  url.searchParams.set("Expires", String(expires));

  const started = Date.now();
  const res = await fetch(url, { method: "GET" });
  const body = await res.text();
  const ms = Date.now() - started;

  return {
    serverUrl: base,
    status: res.status,
    contentType: res.headers.get("content-type"),
    ms,
    bodyPreview: body.slice(0, 300),
    ok: res.ok,
    isPong: /pong/i.test(body),
  };
}

const { accessId, secretKey } = loadKeys();
if (!accessId || !secretKey) {
  console.error("Missing Access ID or Secret Key.");
  process.exit(1);
}

const candidates = process.argv.slice(2);
if (candidates.length === 0) {
  candidates.push(
    process.env.CTIX_BASE_URL,
    "https://ctixapiv3.cyware.com/ctixapi",
    "https://ctix.cyware.com/ctixapi"
  );
}

const unique = [...new Set(candidates.filter(Boolean))];
console.log(`Access ID: ${accessId.slice(0, 8)}…`);
console.log(`Trying ${unique.length} base URL(s)…\n`);

for (const base of unique) {
  try {
    const result = await ping(base, accessId, secretKey);
    console.log(`--- ${result.serverUrl} ---`);
    console.log(`Status: ${result.status} (${result.ms}ms)`);
    console.log(`Content-Type: ${result.contentType}`);
    console.log(`Body: ${result.bodyPreview.replace(/\s+/g, " ")}`);
    if (result.isPong) {
      console.log("\n✓ SUCCESS — got pong from tenant.");
      process.exit(0);
    }
    console.log("");
  } catch (e) {
    console.log(`--- ${base} ---`);
    console.log(`Error: ${e.message}\n`);
  }
}

console.error(
  "✗ No pong response. Add your CSV Endpoint URL as an argument:\n" +
    "  node scripts/postman-ping.mjs https://YOUR-TENANT/ctixapi/"
);
process.exit(1);
