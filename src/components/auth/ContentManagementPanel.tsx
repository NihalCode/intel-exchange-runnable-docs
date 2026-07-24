"use client";

import { useState } from "react";

import { useDocumentationAuth } from "@/components/auth/DocumentationAuthProvider";
import {
  SignalButton,
  SignalErrorState,
  SignalPermissionState,
  SignalSelect,
  SignalSkeleton,
  SignalTextarea,
} from "@/components/fabric";
import { withCsrfHeaders } from "@/lib/csrf-client";
import {
  POSTMAN_PASTE_INSTRUCTIONS,
  SAMPLE_POSTMAN_COLLECTION_JSON,
} from "@/lib/developer/postman-sample";

const PRODUCTS = [
  { id: "ctix", label: "CTIX / Intel Exchange", syncNote: "Theneo (ctixapiv3.cyware.com)" },
  { id: "csap", label: "CSAP", syncNote: "Theneo (csapapi.cyware.com)" },
  { id: "orchestrate", label: "Cyware Orchestrate", syncNote: "Theneo (orchestrateapi.cyware.com)" },
  { id: "cftr", label: "CFTR", syncNote: "Public Postman API (usually works on Vercel)" },
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

  const selectedProduct = PRODUCTS.find((p) => p.id === productId) ?? PRODUCTS[0]!;

  async function runDocSync() {
    if (!canSync) return;
    setBusy(true);
    setError(null);
    setLastResult("");
    try {
      const res = await fetch(`/api/products/${productId}/ingest`, {
        method: "POST",
        headers: await withCsrfHeaders(),
      });
      const text = await res.text();
      let data: { error?: string; detail?: string };
      try {
        data = JSON.parse(text) as typeof data;
      } catch {
        throw new Error(text.slice(0, 200) || `Sync failed (HTTP ${res.status})`);
      }
      setLastResult(JSON.stringify(data, null, 2));
      if (!res.ok) {
        const msg = [data.error, data.detail].filter(Boolean).join(" — ");
        throw new Error(msg || "Sync failed");
      }
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
      let collection: unknown;
      try {
        collection = JSON.parse(collectionText);
      } catch {
        throw new Error(
          "The text box must contain valid Postman Collection v2.1 JSON (full file contents starting with { and \"info\")."
        );
      }
      const res = await fetch("/api/developer/postman", {
        method: "POST",
        headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ productId, collection, write }),
      });
      const text = await res.text();
      let data: { error?: string; detail?: string };
      try {
        data = JSON.parse(text) as typeof data;
      } catch {
        throw new Error(text.slice(0, 200) || `Import failed (HTTP ${res.status})`);
      }
      setLastResult(JSON.stringify(data, null, 2));
      if (!res.ok) {
        const msg = [data.error, data.detail].filter(Boolean).join(" — ");
        throw new Error(msg || "Parse/import failed");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Parse/import failed");
    } finally {
      setBusy(false);
    }
  }

  if (state.loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading">
        <SignalSkeleton className="h-4 w-48" />
        <SignalSkeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!canSync && !canManageSources) {
    return (
      <div data-testid="content-access-denied">
        <SignalPermissionState
          title="Access restricted"
          description="You do not have permission to manage documentation content."
        />
      </div>
    );
  }

  return (
    <div className="space-y-8" data-testid="content-management">
      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        Signed in with your workspace account — no developer token required.
      </p>

      {canSync ? (
        <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold">Sync documentation</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Re-fetch documentation from upstream ({selectedProduct.syncNote}). On Vercel, output is
            written to <code className="font-mono">/tmp</code> only — it does not update the live
            site until you commit and redeploy.
          </p>
          <div className="mt-3 max-w-sm">
            <SignalSelect
              label="Product"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              data-testid="sync-product"
            >
              {PRODUCTS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </SignalSelect>
          </div>
          {productId !== "cftr" ? (
            <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
              If sync returns HTTP 403, Theneo is blocking this cloud server — use{" "}
              <strong>Import Postman collection</strong> below instead.
            </p>
          ) : null}
          <SignalButton
            type="button"
            className="mt-3"
            disabled={busy}
            loading={busy}
            onClick={() => void runDocSync()}
            data-testid="sync-docs-submit"
          >
            Sync from source
          </SignalButton>
        </section>
      ) : null}

      {canManageSources ? (
        <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold">Import Postman collection</h2>
          <p className="mt-1 text-xs text-zinc-500">{POSTMAN_PASTE_INSTRUCTIONS}</p>
          <div className="mt-3 max-w-sm">
            <SignalSelect
              label="Product"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              data-testid="postman-product"
            >
              {PRODUCTS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </SignalSelect>
          </div>
          <div className="mt-3">
            <SignalTextarea
              label="Collection JSON"
              value={collectionText}
              onChange={(e) => setCollectionText(e.target.value)}
              placeholder='Paste full Postman export JSON here, e.g. {"info":{"name":"My API","schema":"https://schema.getpostman.com/json/collection/v2.1.0/collection.json"},...}'
              rows={10}
              className="w-full font-mono text-[11px]"
              data-testid="postman-collection"
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <SignalButton
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => setCollectionText(SAMPLE_POSTMAN_COLLECTION_JSON)}
            >
              Insert sample JSON
            </SignalButton>
            <SignalButton
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy || !collectionText.trim()}
              onClick={() => void parseCollection(false)}
            >
              Preview parse
            </SignalButton>
            {canSync ? (
              <SignalButton
                type="button"
                size="sm"
                disabled={busy || !collectionText.trim()}
                loading={busy}
                onClick={() => void parseCollection(true)}
                data-testid="postman-import-submit"
              >
                Import &amp; write docs
              </SignalButton>
            ) : (
              <p className="self-center text-xs text-zinc-500">
                Import requires sync permission (contact an admin).
              </p>
            )}
          </div>
        </section>
      ) : null}

      {error ? (
        <SignalErrorState title="Operation failed" description={error} />
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
