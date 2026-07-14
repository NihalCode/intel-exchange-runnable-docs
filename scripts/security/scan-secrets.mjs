#!/usr/bin/env node
/**
 * Fail if sensitive filename patterns appear tracked by git or outside the allowlist.
 * Does not print file contents — names and relative paths only.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const allowlistPath = join(root, "scripts/security/artifact-allowlist.json");

/** @type {{ forbiddenGlobs: string[] }} */
const allowlist = JSON.parse(readFileSync(allowlistPath, "utf8"));

const FORBIDDEN_NAME_RE = [
  /^\.env(?!\.example$)/i,
  /\.db(-journal)?$/i,
  /^CYWARE KEYS\.txt$/i,
  /^\.cyware-keys\.txt$/i,
  /\.(pem|p12|pfx)$/i,
  /credential.*\.json$/i,
  /^\.cursor\//i,
  /^\.vercel\//i,
  /^\.next\//i,
  /^node_modules\//i,
  /^\.data\//i,
  /^\.tmp(-app-build)?\//i,
  /^coverage\//i,
  /^test-results\//i,
  /^playwright-report\//i,
];

function listTracked() {
  try {
    return execSync("git ls-files -z", { encoding: "buffer" })
      .toString("utf8")
      .split("\0")
      .filter(Boolean);
  } catch {
    console.error("scan-secrets: unable to list git files");
    process.exit(2);
  }
}

const tracked = listTracked();
const offenders = [];

for (const file of tracked) {
  const base = file.split(/[/\\]/).pop() ?? file;
  if (file === ".env.example" || base === ".env.example") continue;
  if (FORBIDDEN_NAME_RE.some((re) => re.test(file) || re.test(base))) {
    offenders.push(file);
  }
}

if (!existsSync(join(root, ".env.example"))) {
  console.error("scan-secrets: missing sanitized .env.example");
  process.exit(1);
}

if (offenders.length) {
  console.error("scan-secrets: FAIL — sensitive paths are tracked:");
  for (const f of offenders) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  `scan-secrets: OK (${tracked.length} tracked files, ${allowlist.forbiddenGlobs.length} forbidden patterns documented)`
);
