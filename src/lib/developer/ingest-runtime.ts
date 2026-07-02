import "server-only";

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
