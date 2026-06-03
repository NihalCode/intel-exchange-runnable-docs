"use client";

import { useRef, useState } from "react";
import { DISPLAY_BASE } from "@/lib/constants";
import { isSensitiveName, maskText } from "@/lib/security";
import type { CredField } from "@/lib/resolve-request";
import { useRunSettings } from "./RunSettings";

// ---------------------------------------------------------------------------
// Pyodide loader (cached singleton)
// ---------------------------------------------------------------------------

type Pyodide = {
  runPythonAsync: (code: string) => Promise<unknown>;
  globals: { set: (key: string, val: unknown) => void };
  setStdout: (opts: { batched: (s: string) => void }) => void;
  setStderr: (opts: { batched: (s: string) => void }) => void;
};

let pyodidePromise: Promise<Pyodide> | null = null;

function loadPyodide(): Promise<Pyodide> {
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      if (!(window as unknown as Record<string, unknown>).loadPyodide) {
        await new Promise<void>((res, rej) => {
          const s = document.createElement("script");
          s.src = "https://cdn.jsdelivr.net/pyodide/v0.27.5/full/pyodide.js";
          s.onload = () => res();
          s.onerror = () => rej(new Error("Failed to load Pyodide from CDN."));
          document.head.appendChild(s);
        });
      }
      const py = await (
        window as unknown as { loadPyodide: (opts?: unknown) => Promise<Pyodide> }
      ).loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.5/full/" });
      return py;
    })();
  }
  return pyodidePromise;
}

// ---------------------------------------------------------------------------
// Python preamble — injected before every user snippet
// Mocks `requests` module via our /api/run proxy (same origin, no CORS).
// ---------------------------------------------------------------------------

const PREAMBLE = `
import sys as _sys, json as _json, builtins as _builtins
from pyodide.http import pyfetch as _pyfetch
from urllib.parse import urlencode as _urlencode

class _Response:
    def __init__(self, status, text):
        self.status_code = status
        self.text = text
        self.ok = 200 <= status < 300
    def json(self):
        return _json.loads(self.text)
    def __repr__(self):
        return f"<Response [{self.status_code}]>"

async def _ctix_request(method, url, params=None, headers=None, json=None, data=None, **kw):
    qs = ("?" + _urlencode(params)) if params else ""
    full_url = url + qs
    hdrs = dict(headers or {})
    body_str = None
    if json is not None:
        body_str = _json.dumps(json)
        hdrs["Content-Type"] = "application/json"
    elif data is not None:
        body_str = _json.dumps(data) if isinstance(data, dict) else str(data)
    proxy_payload = {"method": method, "url": full_url,
        "headers": [{"name": k, "value": str(v)} for k, v in hdrs.items()]}
    if body_str is not None:
        proxy_payload["body"] = body_str
    resp = await _pyfetch("/api/run", method="POST",
        headers={"Content-Type": "application/json"},
        body=_json.dumps(proxy_payload))
    result = _json.loads(await resp.string())
    if "error" in result and "status" not in result:
        raise Exception(result["error"])
    return _Response(result.get("status", 0), result.get("body", ""))

class _RequestsMod:
    def request(self, method, url, **kw): return _ctix_request(method, url, **kw)
    def get(self, url, **kw): return _ctix_request("GET", url, **kw)
    def post(self, url, **kw): return _ctix_request("POST", url, **kw)
    def put(self, url, **kw): return _ctix_request("PUT", url, **kw)
    def patch(self, url, **kw): return _ctix_request("PATCH", url, **kw)
    def delete(self, url, **kw): return _ctix_request("DELETE", url, **kw)

_sys.modules["requests"] = _RequestsMod()
`;

// ---------------------------------------------------------------------------
// Code transformation — make `requests.*(...)` awaitable at top-level.
// runPythonAsync supports top-level await.
// ---------------------------------------------------------------------------

function transformCode(code: string, baseUrl: string, creds: Record<string, string>): string {
  let out = code;

  // Substitute placeholder base URL.
  out = out.replace(/https:\/\/tenantname\.com\/ctixapi/g, baseUrl.replace(/\/+$/, ""));

  // Substitute credential placeholders.
  for (const [name, value] of Object.entries(creds)) {
    if (!value) continue;
    // e.g. "<your access id>", "<enter access id>"
    const safeName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(
      new RegExp(`["']<[^>]*${safeName}[^>]*>["']`, "gi"),
      JSON.stringify(value)
    );
    // Also replace bare placeholder wrapped in double quotes
    out = out.replace(new RegExp(`"<${safeName}>"`, "gi"), JSON.stringify(value));
  }

  // Add `await` before `requests.*(...)` calls so top-level await works.
  out = out.replace(
    /\b(requests\.(request|get|post|put|patch|delete|head)\s*\()/g,
    "await $1"
  );

  return out;
}

// ---------------------------------------------------------------------------
// Credential helpers
// ---------------------------------------------------------------------------

const KNOWN_CRED_NAMES = ["accessid", "signature", "expires"];

function extractCredFields(code: string): CredField[] {
  const fields: CredField[] = [];
  const seen = new Set<string>();
  // Match quoted string params in requests.request(method, url, params={...})
  // Extract the params block (match across newlines without dotAll flag for older targets)
  const paramBlock = code.match(/params\s*=\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  const matches = [...paramBlock.matchAll(/"([^"]+)"\s*:\s*"([^"]+)"/g)];
  for (const m of matches) {
    const name = m[1];
    const val = m[2];
    const key = name.toLowerCase();
    if ((isSensitiveName(name) || KNOWN_CRED_NAMES.includes(key)) && !seen.has(key)) {
      seen.add(key);
      fields.push({ name, example: val });
    }
  }
  return fields;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PyodideRunner({ code }: { code: string }) {
  const { baseUrl, secretValues } = useRunSettings();
  const { getCredential, setCredential } = useRunSettings();
  const [phase, setPhase] = useState<"idle" | "loading-pyodide" | "running">("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string>("");
  const pyRef = useRef<Pyodide | null>(null);

  const credFields = extractCredFields(code);

  const buildCreds = () => {
    const c: Record<string, string> = {};
    for (const f of credFields) c[f.name.toLowerCase()] = getCredential(f.name);
    return c;
  };

  async function run() {
    setLogs([]);
    setError("");
    const collectedLogs: string[] = [];

    try {
      if (!pyRef.current) {
        setPhase("loading-pyodide");
        pyRef.current = await loadPyodide();
      }
      setPhase("running");
      const py = pyRef.current;

      py.setStdout({ batched: (s: string) => collectedLogs.push(s) });
      py.setStderr({ batched: (s: string) => collectedLogs.push(`[stderr] ${s}`) });

      const transformed = PREAMBLE + "\n" + transformCode(code, baseUrl, buildCreds());
      await py.runPythonAsync(transformed);
      setLogs(collectedLogs);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLogs(collectedLogs);
      setError(msg);
    } finally {
      setPhase("idle");
    }
  }

  const busy = phase !== "idle";

  return (
    <div>
      {credFields.length > 0 ? (
        <div className="mt-2 rounded-md border border-amber-400/50 bg-amber-50/50 p-3 dark:bg-amber-950/20">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            <LockIcon />
            Credentials (in-memory only)
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {credFields.map((f) => (
              <label key={f.name} className="flex flex-col gap-1 text-xs">
                <span className="font-medium opacity-80">{f.name}</span>
                <input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={f.example || `Enter ${f.name}`}
                  value={getCredential(f.name)}
                  onChange={(e) => setCredential(f.name, e.target.value)}
                  className="rounded border border-zinc-300 bg-white px-2 py-1 font-mono text-xs outline-none focus:border-sky-500 dark:border-zinc-600 dark:bg-zinc-900"
                />
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-500 disabled:opacity-50"
        >
          {busy ? <Spinner /> : <PlayIcon />}
          {phase === "loading-pyodide"
            ? "Loading Python runtime…"
            : phase === "running"
              ? "Running…"
              : "Run Python"}
        </button>
        {phase === "loading-pyodide" ? (
          <span className="text-[11px] opacity-50">
            First run downloads Pyodide (~10 s) then caches it.
          </span>
        ) : (
          <span className="text-[11px] opacity-50">
            Runs via Pyodide (WebAssembly) · HTTP calls proxied server-side
          </span>
        )}
      </div>

      {(logs.length > 0 || error) ? (
        <div
          className={`mt-2 rounded-md border p-3 text-sm ${
            error
              ? "border-red-400/60 bg-red-50/60 dark:bg-red-950/20"
              : "border-emerald-400/60 bg-emerald-50/60 dark:bg-emerald-950/20"
          }`}
        >
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide opacity-70">
            {error ? "Error" : "Output"}
          </div>
          {logs.length > 0 ? (
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
              {maskText(logs.join("\n"), secretValues)}
            </pre>
          ) : null}
          {error ? (
            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-red-600 dark:text-red-400">
              {maskText(error, secretValues)}
            </pre>
          ) : null}
          {logs.length === 0 && !error ? (
            <span className="text-xs opacity-60">No output.</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
    </svg>
  );
}
function PlayIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}
