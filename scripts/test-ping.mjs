#!/usr/bin/env node
/**
 * Quick live Ping check against your CTIX tenant.
 *
 * Usage (PowerShell):
 *   $env:CTIX_BASE_URL="https://your-tenant.cyware.com/ctixapi"
 *   $env:CTIX_ACCESS_ID="your-access-id"
 *   $env:CTIX_SECRET_KEY="your-secret-key"
 *   node scripts/test-ping.mjs
 */

import crypto from "node:crypto";

const base = (process.env.CTIX_BASE_URL || "").replace(/\/+$/, "");
const accessId = (process.env.CTIX_ACCESS_ID || "").trim();
const secretKey = (process.env.CTIX_SECRET_KEY || "").trim();

if (!base || !accessId || !secretKey) {
  console.error("Missing env vars. Set CTIX_BASE_URL, CTIX_ACCESS_ID, CTIX_SECRET_KEY.");
  process.exit(1);
}

const expires = Math.floor(Date.now() / 1000) + 25;
const toSign = `${accessId}\n${expires}`;
const signature = crypto
  .createHmac("sha1", secretKey)
  .update(toSign)
  .digest("base64");

const url = new URL(`${base}/ping/`);
url.searchParams.set("AccessID", accessId);
url.searchParams.set("Signature", signature);
url.searchParams.set("Expires", String(expires));

console.log("GET", url.toString().replace(secretKey, "***"));

const started = Date.now();
const res = await fetch(url, { method: "GET" });
const body = await res.text();
const ms = Date.now() - started;

console.log("Status:", res.status, res.statusText);
console.log("Content-Type:", res.headers.get("content-type"));
console.log("Duration:", ms + "ms");
console.log("Body preview:", body.slice(0, 500));

if (res.ok && /pong/i.test(body)) {
  console.log("\n✓ Success — tenant responded to Ping.");
  process.exit(0);
}

if (res.status === 403) {
  console.error(
    "\n✗ 403 Forbidden — wrong base URL (not your tenant), blocked credentials, or WAF."
  );
} else if (res.status === 401) {
  console.error("\n✗ 401 — invalid Access ID, Secret Key, or expired signature.");
} else {
  console.error("\n✗ Unexpected response — check base URL and credentials.");
}
process.exit(1);
