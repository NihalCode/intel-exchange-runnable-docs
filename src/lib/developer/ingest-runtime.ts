import "server-only";

import { spawn } from "node:child_process";
import path from "node:path";

/** Writable ingest output on Vercel (deployment filesystem is read-only). */
export const VERCEL_INGEST_ROOT = "/tmp/cyware-docs-ingest";

/** Fixed ingest entrypoint — never derived from request input. */
export const INGEST_SCRIPT_RELATIVE = path.join("scripts", "ingest.mjs");

const MAX_STDOUT_BYTES = 512 * 1024;
const MAX_STDERR_BYTES = 512 * 1024;
const DEFAULT_TIMEOUT_MS = 280_000;

/** Allowlisted argv prefixes for ingest.mjs (no free-form shell tokens). */
const ALLOWED_ARG_PREFIXES = [
  "--product=",
  "--collection-file=",
  "--parser=",
  "--delay=",
  "--limit=",
] as const;

export function isVercelRuntime(): boolean {
  return Boolean(process.env.VERCEL);
}

/**
 * Scrubbed env for the ingest child: inherit process.env but drop obvious
 * browser/session secrets that ingest never needs. Keep DATABASE_URL / Auth0
 * out of the child when possible — ingest only needs product fetch credentials
 * and optional INGEST_OUTPUT_ROOT.
 */
export function ingestSpawnEnv(): NodeJS.ProcessEnv {
  const base: NodeJS.ProcessEnv = { ...process.env };
  delete base.AUTH0_CLIENT_SECRET;
  delete base.AUTH0_SECRET;
  delete base.AUTH0_MANAGEMENT_CLIENT_SECRET;
  delete base.CSRF_SIGNING_SECRET;
  delete base.CONTROL_PLANE_CRON_SECRET;
  delete base.DEVELOPER_ACCESS_TOKEN;
  delete base.DOCUMENTATION_CREDENTIAL_ENCRYPTION_KEY;
  if (isVercelRuntime()) {
    base.INGEST_OUTPUT_ROOT = VERCEL_INGEST_ROOT;
  }
  return base;
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

export function validateIngestArgv(args: string[]): string | null {
  for (const arg of args) {
    if (typeof arg !== "string" || arg.includes("\0")) {
      return "ingest argv rejected: invalid argument";
    }
    if (/[\r\n;`|&$]/.test(arg)) {
      return "ingest argv rejected: shell metacharacters";
    }
    if (!ALLOWED_ARG_PREFIXES.some((prefix) => arg.startsWith(prefix))) {
      return `ingest argv rejected: unsupported flag (${arg.split("=")[0]})`;
    }
    if (arg.startsWith("--collection-file=")) {
      const filePath = arg.slice("--collection-file=".length);
      if (!filePath) {
        return "ingest argv rejected: empty collection-file";
      }
      if (/(^|[\\/])\.\.([\\/]|$)/.test(filePath)) {
        return "ingest argv rejected: path traversal in collection-file";
      }
    }
  }
  return null;
}

/**
 * Single command-execution site for documentation ingestion. Runs the local
 * `scripts/ingest.mjs` as a Node child process and collects its output.
 *
 * Intentional-safe (accepted risk):
 *  - Executable pinned to `process.execPath` (never user-supplied).
 *  - Arguments are an argv ARRAY with `shell: false`.
 *  - Flags allowlisted; NUL / shell metacharacters rejected.
 *  - Timeout + stdout/stderr caps.
 *  - Scrubbed child environment (no session/CSRF secrets).
 *  - Callers are auth-guarded admin/developer routes only.
 */
export function runIngestScript(
  args: string[],
  options?: { timeoutMs?: number }
): Promise<IngestRunResult> {
  const rejected = validateIngestArgv(args);
  if (rejected) {
    return Promise.resolve({ code: 1, stdout: "", stderr: rejected });
  }

  const script = path.join(process.cwd(), INGEST_SCRIPT_RELATIVE);
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise<IngestRunResult>((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: process.cwd(),
      env: ingestSpawnEnv(),
      windowsHide: true,
      shell: false,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (code: number, out: string, err: string) => {
      if (settled) return;
      settled = true;
      resolve({ code, stdout: out, stderr: err });
    };

    const timer = setTimeout(() => {
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      finish(1, stdout, stderr || "ingest timed out");
    }, timeoutMs);

    child.stdout.on("data", (d: Buffer) => {
      if (stdout.length < MAX_STDOUT_BYTES) {
        stdout += d.toString("utf8", 0, MAX_STDOUT_BYTES - stdout.length);
      }
    });
    child.stderr.on("data", (d: Buffer) => {
      if (stderr.length < MAX_STDERR_BYTES) {
        stderr += d.toString("utf8", 0, MAX_STDERR_BYTES - stderr.length);
      }
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      finish(1, stdout, err.message);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      finish(code ?? 1, stdout, stderr);
    });
  });
}
