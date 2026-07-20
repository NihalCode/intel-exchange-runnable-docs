"use client";

import { useCallback, useEffect, useState } from "react";
import { withCsrfHeaders } from "@/lib/csrf-client";
import { isLiveApiUiEnabled } from "@/lib/public-docs-mode";

const TOKEN_KEY = "iedocs.developerToken";

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export function DeveloperConsole() {
  const [token, setToken] = useState("");
  const [stored, setStored] = useState(false);
  const [diagnostics, setDiagnostics] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [productId, setProductId] = useState("cftr");
  const [collectionText, setCollectionText] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<string>("");

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const token = sessionStorage.getItem(TOKEN_KEY);
        if (token) {
          setToken(token);
          setStored(true);
        }
      } catch {
        /* ignore */
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const saveToken = () => {
    try {
      sessionStorage.setItem(TOKEN_KEY, token.trim());
      setStored(true);
    } catch {
      /* ignore */
    }
  };

  const loadDiagnostics = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/developer/diagnostics", {
        headers: authHeaders(token.trim()),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load diagnostics");
      setDiagnostics(data.diagnostics);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }, [token]);

  async function parseCollection(write: boolean) {
    setError(null);
    setBusy(true);
    setLastResult("");
    try {
      const collection = JSON.parse(collectionText);
      const headers = write
        ? await withCsrfHeaders(authHeaders(token.trim()))
        : authHeaders(token.trim());
      const res = await fetch("/api/developer/postman", {
        method: "POST",
        headers,
        body: JSON.stringify({ productId, collection, write }),
      });
      const data = await res.json();
      setLastResult(JSON.stringify(data, null, 2));
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      if (write) await loadDiagnostics();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Parse/import failed");
    } finally {
      setBusy(false);
    }
  }

  const [validateProductId, setValidateProductId] = useState("all");
  const [validateLive, setValidateLive] = useState(false);

  async function runValidation() {
    setError(null);
    setBusy(true);
    setLastResult("");
    try {
      const body: Record<string, unknown> = { live: validateLive };
      if (validateProductId !== "all") body.productId = validateProductId;
      const res = await fetch("/api/developer/validate", {
        method: "POST",
        headers: authHeaders(token.trim()),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setLastResult(JSON.stringify(data, null, 2));
      if (!res.ok) throw new Error(data.error ?? "Validation failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Validation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="mb-2 text-sm font-semibold">Developer access token</h2>
        <p className="mb-3 text-xs text-zinc-600 dark:text-zinc-400">
          Server env <code className="font-mono">DEVELOPER_ACCESS_TOKEN</code> — never share with
          documentation clients. Used for Postman import, ingest, and diagnostics only.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Bearer token"
            className="min-w-[240px] flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="button"
            onClick={saveToken}
            className="rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Save for session
          </button>
          <button
            type="button"
            disabled={!token.trim() || busy}
            onClick={() => loadDiagnostics()}
            className="rounded-md border border-zinc-300 px-3 py-2 text-xs font-medium dark:border-zinc-700"
          >
            Run diagnostics
          </button>
        </div>
        {stored ? (
          <p className="mt-2 text-[11px] text-emerald-600">Token saved in session storage.</p>
        ) : null}
      </section>

      <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="mb-2 text-sm font-semibold">Public vs developer modes</h2>
        <ul className="list-inside list-disc text-xs text-zinc-600 dark:text-zinc-400">
          <li>
            <strong>Public docs (default):</strong> clients get documentation + placeholder code
            only. No credential UI.
          </li>
          <li>
            <strong>Live API UI:</strong> set{" "}
            <code className="font-mono">NEXT_PUBLIC_ENABLE_LIVE_API_UI=true</code> for developer
            testing in the main app shell.
          </li>
          <li>
            Current live UI:{" "}
            <strong>{isLiveApiUiEnabled() ? "enabled" : "disabled (public docs)"}</strong>
          </li>
        </ul>
      </section>

      <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="mb-2 text-sm font-semibold">Validate endpoints</h2>
        <p className="mb-3 text-xs text-zinc-600 dark:text-zinc-400">
          Static validation runs snippet/path checks for every documented endpoint. Optional live
          probes send GET requests using server-side{" "}
          <code className="font-mono">DEV_CYWARE_*</code> credentials (requires{" "}
          <code className="font-mono">ENABLE_API_EXECUTION=true</code>).
        </p>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <label className="block text-xs font-medium">
            Product
            <select
              value={validateProductId}
              onChange={(e) => setValidateProductId(e.target.value)}
              className="mt-1 block rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="all">All products</option>
              <option value="ctix">CTIX</option>
              <option value="cftr">CFTR</option>
              <option value="csap">CSAP</option>
              <option value="orchestrate">Orchestrate</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={validateLive}
              onChange={(e) => setValidateLive(e.target.checked)}
            />
            Include live GET probes (15 per product)
          </label>
        </div>
        <button
          type="button"
          disabled={busy || !token.trim()}
          onClick={() => runValidation()}
          className="rounded-md bg-emerald-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
        >
          Run validation
        </button>
      </section>

      <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="mb-2 text-sm font-semibold">Import Postman collection</h2>
        <p className="mb-3 text-xs text-zinc-600 dark:text-zinc-400">
          Requires developer token + server-side{" "}
          <code className="font-mono">DEV_CYWARE_*</code> credentials for the target product.
        </p>
        <label className="mb-2 block text-xs font-medium">
          Product
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="mt-1 block rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="ctix">CTIX</option>
            <option value="cftr">CFTR</option>
            <option value="csap">CSAP</option>
            <option value="orchestrate">Orchestrate</option>
          </select>
        </label>
        <textarea
          value={collectionText}
          onChange={(e) => setCollectionText(e.target.value)}
          placeholder="Paste Postman Collection v2.1 JSON…"
          rows={12}
          className="mb-2 w-full rounded-md border border-zinc-300 bg-white p-2 font-mono text-[11px] dark:border-zinc-700 dark:bg-zinc-900"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !collectionText.trim()}
            onClick={() => parseCollection(false)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-xs font-medium dark:border-zinc-700"
          >
            Preview parse
          </button>
          <button
            type="button"
            disabled={busy || !collectionText.trim() || !token.trim()}
            onClick={() => parseCollection(true)}
            className="rounded-md bg-sky-700 px-3 py-2 text-xs font-medium text-white"
          >
            Import &amp; write docs
          </button>
        </div>
      </section>

      {error ? (
        <p className="rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {diagnostics ? (
        <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="mb-2 text-sm font-semibold">Diagnostics</h2>
          <pre className="max-h-96 overflow-auto text-[11px] text-zinc-700 dark:text-zinc-300">
            {JSON.stringify(diagnostics, null, 2)}
          </pre>
        </section>
      ) : null}

      {lastResult ? (
        <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="mb-2 text-sm font-semibold">Last operation</h2>
          <pre className="max-h-96 overflow-auto text-[11px]">{lastResult}</pre>
        </section>
      ) : null}
    </div>
  );
}
