"use client";

import { useCallback, useEffect, useState } from "react";
import { withCsrfHeaders } from "@/lib/csrf-client";
import { isLiveApiUiEnabled } from "@/lib/public-docs-mode";

const TOKEN_KEY = "iedocs.developerToken";

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function OpsPanel({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius-sm)] border border-[var(--atlas-line)] bg-[color-mix(in_srgb,var(--atlas-elevated)_90%,transparent)] p-4">
      <p className="atlas-micro-label text-[var(--atlas-signal)]">{label}</p>
      <h2 className="mt-1 text-sm font-semibold tracking-[-0.01em] text-[var(--atlas-text)]">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
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

  const inputClass =
    "min-w-[240px] flex-1 rounded-[var(--radius-sm)] border border-[var(--atlas-line)] bg-[var(--atlas-deep)] px-3 py-2 font-mono text-xs text-[var(--atlas-text)]";
  const selectClass =
    "mt-1 block rounded-[var(--radius-sm)] border border-[var(--atlas-line)] bg-[var(--atlas-deep)] px-2 py-1.5 text-xs text-[var(--atlas-text)]";

  return (
    <div className="atlas-ops-console space-y-4" data-layout="atlas-ops-console">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-[var(--atlas-line)] pb-3">
        <div>
          <p className="atlas-micro-label text-[var(--atlas-signal)]">Live ops</p>
          <h1 className="text-lg font-semibold tracking-[-0.02em] text-[var(--atlas-text)]">
            Developer console
          </h1>
        </div>
        <span
          className={`atlas-live-status atlas-live-status--${busy ? "amber" : "signal"}`}
          data-testid="atlas-live-status"
        >
          <span className="atlas-live-status__pulse" aria-hidden="true" />
          <span className="atlas-live-status__label">{busy ? "Running" : "Ready"}</span>
        </span>
      </div>

      <OpsPanel label="Clearance" title="Developer access token">
        <p className="mb-3 text-xs text-[var(--atlas-text-secondary)]">
          Server env <code className="font-mono text-[var(--atlas-signal)]">DEVELOPER_ACCESS_TOKEN</code>{" "}
          — never share with documentation clients. Used for Postman import, ingest, and diagnostics
          only.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Bearer token"
            className={inputClass}
          />
          <button
            type="button"
            onClick={saveToken}
            className="atlas-btn-primary rounded-[var(--radius-sm)] px-3 py-2 text-xs"
          >
            Save for session
          </button>
          <button
            type="button"
            disabled={!token.trim() || busy}
            onClick={() => loadDiagnostics()}
            className="atlas-btn-ghost rounded-[var(--radius-sm)] px-3 py-2 text-xs disabled:opacity-50"
          >
            Run diagnostics
          </button>
        </div>
        {stored ? (
          <p className="mt-2 font-mono text-[11px] text-[var(--atlas-signal)]">
            Token saved in session storage.
          </p>
        ) : null}
      </OpsPanel>

      <OpsPanel label="Mode" title="Public vs developer modes">
        <ul className="list-inside list-disc text-xs text-[var(--atlas-text-secondary)]">
          <li>
            <strong className="text-[var(--atlas-text)]">Public docs (default):</strong> clients get
            documentation + placeholder code only. No credential UI.
          </li>
          <li>
            <strong className="text-[var(--atlas-text)]">Live API UI:</strong> set{" "}
            <code className="font-mono text-[var(--atlas-signal)]">
              NEXT_PUBLIC_ENABLE_LIVE_API_UI=true
            </code>{" "}
            for developer testing in the main app shell.
          </li>
          <li>
            Current live UI:{" "}
            <strong className="text-[var(--atlas-text)]">
              {isLiveApiUiEnabled() ? "enabled" : "disabled (public docs)"}
            </strong>
          </li>
        </ul>
      </OpsPanel>

      <OpsPanel label="Probe" title="Validate endpoints">
        <p className="mb-3 text-xs text-[var(--atlas-text-secondary)]">
          Static validation runs snippet/path checks for every documented endpoint. Optional live
          probes send GET requests using server-side{" "}
          <code className="font-mono text-[var(--atlas-signal)]">DEV_CYWARE_*</code> credentials
          (requires <code className="font-mono text-[var(--atlas-signal)]">ENABLE_API_EXECUTION=true</code>
          ).
        </p>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <label className="block text-xs font-medium text-[var(--atlas-text-secondary)]">
            Product
            <select
              value={validateProductId}
              onChange={(e) => setValidateProductId(e.target.value)}
              className={selectClass}
            >
              <option value="all">All products</option>
              <option value="ctix">CTIX</option>
              <option value="cftr">CFTR</option>
              <option value="csap">CSAP</option>
              <option value="orchestrate">Orchestrate</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-[var(--atlas-text-secondary)]">
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
          className="atlas-btn-primary rounded-[var(--radius-sm)] px-3 py-2 text-xs disabled:opacity-50"
        >
          Run validation
        </button>
      </OpsPanel>

      <OpsPanel label="Ingest" title="Import Postman collection">
        <p className="mb-3 text-xs text-[var(--atlas-text-secondary)]">
          Requires developer token + server-side{" "}
          <code className="font-mono text-[var(--atlas-signal)]">DEV_CYWARE_*</code> credentials for
          the target product.
        </p>
        <label className="mb-2 block text-xs font-medium text-[var(--atlas-text-secondary)]">
          Product
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className={selectClass}
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
          className="mb-2 w-full rounded-[var(--radius-sm)] border border-[var(--atlas-line)] bg-[var(--atlas-deep)] p-2 font-mono text-[11px] text-[var(--atlas-text)]"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !collectionText.trim()}
            onClick={() => parseCollection(false)}
            className="atlas-btn-ghost rounded-[var(--radius-sm)] px-3 py-2 text-xs disabled:opacity-50"
          >
            Preview parse
          </button>
          <button
            type="button"
            disabled={busy || !collectionText.trim() || !token.trim()}
            onClick={() => parseCollection(true)}
            className="atlas-btn-primary rounded-[var(--radius-sm)] px-3 py-2 text-xs disabled:opacity-50"
          >
            Import &amp; write docs
          </button>
        </div>
      </OpsPanel>

      {error ? (
        <p
          className="rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--atlas-danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--atlas-danger)_10%,transparent)] p-3 text-xs text-[var(--atlas-danger)]"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {diagnostics ? (
        <OpsPanel label="Telemetry" title="Diagnostics">
          <pre className="max-h-96 overflow-auto rounded-[var(--radius-sm)] border border-[var(--atlas-line)] bg-[var(--atlas-deep)] p-3 font-mono text-[11px] text-[var(--atlas-text-secondary)]">
            {JSON.stringify(diagnostics, null, 2)}
          </pre>
        </OpsPanel>
      ) : null}

      {lastResult ? (
        <OpsPanel label="Output" title="Last operation">
          <pre className="max-h-96 overflow-auto rounded-[var(--radius-sm)] border border-[var(--atlas-line)] bg-[var(--atlas-deep)] p-3 font-mono text-[11px] text-[var(--atlas-text)]">
            {lastResult}
          </pre>
        </OpsPanel>
      ) : null}
    </div>
  );
}
