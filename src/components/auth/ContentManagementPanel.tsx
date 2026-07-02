"use client";

import { useState } from "react";

import { useDocumentationAuth } from "@/components/auth/DocumentationAuthProvider";

const PRODUCTS = [
  { id: "ctix", label: "CTIX / Intel Exchange" },
  { id: "csap", label: "CSAP" },
  { id: "orchestrate", label: "Cyware Orchestrate" },
  { id: "cftr", label: "CFTR" },
];

export function ContentManagementPanel() {
  const { state, hasPermission } = useDocumentationAuth();
  const canSync = hasPermission("sync_docs");
  const canManageSources = hasPermission("manage_sources");

  const [productId, setProductId] = useState("ctix");
  const [collectionText, setCollectionText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState("");

  async function runDocSync() {
    if (!canSync) return;
    setBusy(true);
    setError(null);
    setLastResult("");
    try {
      const res = await fetch(`/api/products/${productId}/ingest`, { method: "POST" });
      const data = await res.json();
      setLastResult(JSON.stringify(data, null, 2));
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  async function parseCollection(write: boolean) {
    if (!canManageSources || (write && !canSync)) return;
    setBusy(true);
    setError(null);
    setLastResult("");
    try {
      const collection = JSON.parse(collectionText);
      const res = await fetch("/api/developer/postman", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, collection, write }),
      });
      const data = await res.json();
      setLastResult(JSON.stringify(data, null, 2));
      if (!res.ok) throw new Error(data.error ?? "Import failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Parse/import failed");
    } finally {
      setBusy(false);
    }
  }

  if (state.loading) {
    return <p className="text-sm text-zinc-500">Loading…</p>;
  }

  if (!canSync && !canManageSources) {
    return (
      <p className="text-sm text-red-600 dark:text-red-400" data-testid="content-access-denied">
        You do not have permission to manage documentation content.
      </p>
    );
  }

  const postmanProducts = PRODUCTS;

  return (
    <div className="space-y-8" data-testid="content-management">
      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        Signed in with your workspace account — no developer token required.
      </p>

      {canSync ? (
        <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold">Sync documentation</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Re-fetch documentation from the configured source URLs and rebuild local page files.
          </p>
          <label className="mt-3 block text-xs">
            <span className="text-zinc-500">Product</span>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="mt-1 block rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              data-testid="sync-product"
            >
              {PRODUCTS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void runDocSync()}
            data-testid="sync-docs-submit"
            className="mt-3 rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {busy ? "Syncing…" : "Sync from source"}
          </button>
        </section>
      ) : null}

      {canManageSources ? (
        <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold">Import Postman collection</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Preview or import a Postman Collection v2.1 JSON as a documentation source.
          </p>
          <label className="mt-3 block text-xs">
            <span className="text-zinc-500">Product</span>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="mt-1 block rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              data-testid="postman-product"
            >
              {postmanProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <textarea
            value={collectionText}
            onChange={(e) => setCollectionText(e.target.value)}
            placeholder="Paste Postman Collection v2.1 JSON…"
            rows={10}
            className="mt-3 w-full rounded border border-zinc-300 bg-white p-2 font-mono text-[11px] dark:border-zinc-700 dark:bg-zinc-900"
            data-testid="postman-collection"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !collectionText.trim()}
              onClick={() => void parseCollection(false)}
              className="rounded border border-zinc-300 px-3 py-1.5 text-xs font-medium dark:border-zinc-700"
            >
              Preview parse
            </button>
            {canSync ? (
              <button
                type="button"
                disabled={busy || !collectionText.trim()}
                onClick={() => void parseCollection(true)}
                data-testid="postman-import-submit"
                className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                Import &amp; write docs
              </button>
            ) : (
              <p className="text-xs text-zinc-500 self-center">
                Import requires sync permission (contact an admin).
              </p>
            )}
          </div>
        </section>
      ) : null}

      {error ? (
        <p className="rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {lastResult ? (
        <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold">Last operation</h2>
          <pre className="mt-2 max-h-96 overflow-auto text-[11px]">{lastResult}</pre>
        </section>
      ) : null}
    </div>
  );
}
