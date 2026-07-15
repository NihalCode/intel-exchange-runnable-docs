import "server-only";

import { spawn } from "node:child_process";
import path from "node:path";

/** Writable ingest output on Vercel (deployment filesystem is read-only). */
export const VERCEL_INGEST_ROOT = "/tmp/cyware-docs-ingest";

export function isVercelRuntime(): boolean {
  return Boolean(process.env.VERCEL);
}

/** Env passed to `scripts/ingest.mjs` child processes. */
export function ingestSpawnEnv(): NodeJS.ProcessEnv {
  if (!isVercelRuntime()) return process.env;
  return { ...process.env, INGEST_OUTPUT_ROOT: VERCEL_INGEST_ROOT };
}

/** Temp dir for Postman collection files during import. */
export function postmanImportTempDir(): string {
  if (isVercelRuntime()) return "/tmp/postman-import";
  return path.join(process.cwd(), ".tmp", "postman-import");
}

/** Ingest parser for Postman writes — JS parser avoids tsx at serverless runtime. */
export function postmanIngestParser(): "js" | "ts" {
  return isVercelRuntime() ? "js" : "ts";
}

export interface IngestRunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Single command-execution site for documentation ingestion. Runs the local
 * `scripts/ingest.mjs` as a Node child process and collects its output.
 *
 * This is intentionally the ONLY child_process call site in application source —
 * both API routes funnel through it — so the trusted-execution invariant is
 * defined and reviewed in one place.
 *
 * Why this is not a shell-injection sink:
 *  - The executable is pinned to `process.execPath` (the running Node binary),
 *    never a user-supplied program name.
 *  - Arguments are passed as an argv ARRAY, so there is no shell command string
 *    to inject into. `shell:true` is deliberately NOT set, so no shell is used.
 *  - Callers validate `productId` against the product registry and generate the
 *    `--collection-file` path server-side; no raw request text reaches argv.
 *  - The route handlers are auth-guarded before this runs.
 */
export function runIngestScript(args: string[]): Promise<IngestRunResult> {
  const script = path.join(process.cwd(), "scripts", "ingest.mjs");
  return new Promise<IngestRunResult>((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: process.cwd(),
      env: ingestSpawnEnv(),
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}
