#!/usr/bin/env node
/**
 * Verify a proposed archive root or cwd has no forbidden artifacts.
 * Usage: node scripts/security/check-archive.mjs [dir]
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { readFileSync } from "node:fs";

const target = resolve(process.argv[2] || process.cwd());
const allowlist = JSON.parse(
  readFileSync(join(process.cwd(), "scripts/security/artifact-allowlist.json"), "utf8")
);

const FORBIDDEN_DIR_NAMES = new Set([
  "node_modules",
  ".next",
  ".git",
  ".data",
  ".vercel",
  ".cursor",
  "coverage",
  "test-results",
  "playwright-report",
  ".tmp",
  ".tmp-app-build",
]);

const FORBIDDEN_FILE_RE = [
  /^\.env(?!\.example$)/i,
  /\.db(-journal)?$/i,
  /^CYWARE KEYS\.txt$/i,
  /\.(pem|p12|pfx)$/i,
];

/** @type {string[]} */
const hits = [];

function walk(dir, depth = 0) {
  if (depth > 8) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const full = join(dir, ent.name);
    const rel = relative(target, full).replace(/\\/g, "/");
    if (ent.isDirectory()) {
      if (FORBIDDEN_DIR_NAMES.has(ent.name)) {
        hits.push(rel + "/");
        continue;
      }
      walk(full, depth + 1);
    } else if (ent.isFile()) {
      if (ent.name === ".env.example") continue;
      if (FORBIDDEN_FILE_RE.some((re) => re.test(ent.name) || re.test(rel))) {
        hits.push(rel);
      }
    }
  }
}

if (!existsSync(target) || !statSync(target).isDirectory()) {
  console.error("archive:check: target is not a directory");
  process.exit(2);
}

walk(target);

if (hits.length) {
  console.error("archive:check: FAIL — forbidden artifacts present:");
  for (const h of hits.slice(0, 50)) console.error(`  - ${h}`);
  if (hits.length > 50) console.error(`  … +${hits.length - 50} more`);
  process.exit(1);
}

console.log(
  `archive:check: OK for ${target} (${allowlist.allowedRootEntries.length} documented allowlist roots)`
);
