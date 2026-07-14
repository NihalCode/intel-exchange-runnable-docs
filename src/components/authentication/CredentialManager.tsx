"use client";

import { useEffect, useMemo, useState } from "react";

type ProductId = "ctix" | "cftr" | "orchestrate" | "csap";
type Credential = {
  productId: ProductId;
  baseUrl: string;
  accessIdMasked: string;
  status: string;
  authorizedScopes: string[];
  validatedAt: string | null;
  expiresAt: string | null;
};

const PRODUCTS: Array<{ id: ProductId; label: string; hint: string }> = [
  { id: "ctix", label: "CTIX / Intel Exchange", hint: "Tenant URL ending in /ctixapi" },
  { id: "cftr", label: "CFTR", hint: "CFTR tenant Open API URL" },
  { id: "orchestrate", label: "Cyware Orchestrate", hint: "Orchestrate tenant API URL" },
  { id: "csap", label: "CSAP", hint: "CSAP tenant API URL" },
];

async function csrfToken(): Promise<string> {
  const response = await fetch("/api/admin/control-plane/context", { cache: "no-store" });
  if (!response.ok) throw new Error("Could not initialize secure request");
  return ((await response.json()) as { csrfToken: string }).csrfToken;
}

function statusLabel(status: string | undefined): string {
  if (status === "valid") return "Connected";
  if (!status) return "Not connected";
  return status.replace(/_/g, " ");
}

export function CredentialManager() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<ProductId>("ctix");
  const [forms, setForms] = useState<Record<string, { baseUrl: string; accessId: string; secretKey: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Record<string, string>>({});

  const connectedCount = useMemo(
    () => credentials.filter((item) => item.status === "valid").length,
    [credentials]
  );

  const product = PRODUCTS.find((item) => item.id === selectedProductId) ?? PRODUCTS[0]!;
  const credential = credentials.find((item) => item.productId === product.id);
  const form = forms[product.id] ?? { baseUrl: "", accessId: "", secretKey: "" };

  async function load() {
    const response = await fetch("/api/authentication/credentials", { cache: "no-store" });
    if (response.ok) {
      setCredentials(((await response.json()) as { credentials: Credential[] }).credentials);
    }
  }

  useEffect(() => {
    queueMicrotask(() => void load());
  }, []);

  function update(productId: ProductId, field: string, value: string) {
    setForms((current) => ({
      ...current,
      [productId]: {
        baseUrl: current[productId]?.baseUrl ?? "",
        accessId: current[productId]?.accessId ?? "",
        secretKey: current[productId]?.secretKey ?? "",
        [field]: value,
      },
    }));
  }

  async function connect(productId: ProductId) {
    const formValues = forms[productId];
    if (!formValues?.baseUrl || !formValues.accessId || !formValues.secretKey) return;
    setBusy(productId);
    setMessage((value) => ({ ...value, [productId]: "" }));
    try {
      const token = await csrfToken();
      const response = await fetch("/api/authentication/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
        body: JSON.stringify({ productId, ...formValues }),
      });
      const data = (await response.json()) as { credential?: Credential; error?: string };
      setMessage((value) => ({
        ...value,
        [productId]:
          response.ok && data.credential?.status === "valid"
            ? "Connected and validated."
            : "Connection could not be validated. Check the URL and credentials.",
      }));
      setForms((current) => ({
        ...current,
        [productId]: { ...current[productId]!, secretKey: "" },
      }));
      await load();
    } catch {
      setMessage((value) => ({ ...value, [productId]: "Connection could not be validated." }));
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(productId: ProductId) {
    setBusy(productId);
    try {
      const token = await csrfToken();
      await fetch(`/api/authentication/credentials?productId=${productId}`, {
        method: "DELETE",
        headers: { "X-CSRF-Token": token },
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
          Product
        </label>
        <select
          value={selectedProductId}
          onChange={(event) => setSelectedProductId(event.target.value as ProductId)}
          className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium dark:border-zinc-700 dark:bg-zinc-950"
        >
          {PRODUCTS.map((item) => {
            const itemCredential = credentials.find((entry) => entry.productId === item.id);
            const suffix =
              itemCredential?.status === "valid"
                ? " — connected"
                : itemCredential?.status
                  ? ` — ${itemCredential.status}`
                  : "";
            return (
              <option key={item.id} value={item.id}>
                {item.label}
                {suffix}
              </option>
            );
          })}
        </select>
        <p className="mt-2 text-xs text-zinc-500">
          {connectedCount} of {PRODUCTS.length} products connected. Select a product to view or
          update its credentials.
        </p>
      </div>

      <section className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">{product.label}</h2>
            <p className="mt-1 text-xs text-zinc-500">{product.hint}</p>
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              credential?.status === "valid"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
            }`}
          >
            {statusLabel(credential?.status)}
          </span>
        </div>

        {credential ? (
          <div className="mt-4 space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
            <p className="break-all">Base URL: {credential.baseUrl}</p>
            <p>Access ID: {credential.accessIdMasked}</p>
            <p>
              Last validated:{" "}
              {credential.validatedAt
                ? new Date(credential.validatedAt).toLocaleString()
                : "Never"}
            </p>
            <p>
              Expires:{" "}
              {credential.expiresAt
                ? new Date(credential.expiresAt).toLocaleString()
                : "Provider managed"}
            </p>
            <p>
              Scopes:{" "}
              {credential.authorizedScopes.length
                ? credential.authorizedScopes.join(", ")
                : "Not reported"}
            </p>
          </div>
        ) : null}

        <div className="mt-4 space-y-3">
          <label className="block text-xs">
            <span>Environment / Base URL</span>
            <input
              value={form.baseUrl}
              onChange={(event) => update(product.id, "baseUrl", event.target.value)}
              placeholder="https://your-tenant.cyware.com/…"
              className="mt-1 w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            />
          </label>
          <label className="block text-xs">
            <span>Access ID</span>
            <input
              value={form.accessId}
              onChange={(event) => update(product.id, "accessId", event.target.value)}
              autoComplete="off"
              className="mt-1 w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            />
          </label>
          <label className="block text-xs">
            <span>Secret Key</span>
            <input
              type="password"
              value={form.secretKey}
              onChange={(event) => update(product.id, "secretKey", event.target.value)}
              autoComplete="new-password"
              className="mt-1 w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            />
          </label>
        </div>

        {message[product.id] ? (
          <p className="mt-3 text-xs" role="status">
            {message[product.id]}
          </p>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={busy === product.id}
            onClick={() => void connect(product.id)}
            className="rounded-md bg-sky-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            {busy === product.id ? "Testing…" : "Test & connect"}
          </button>
          {credential ? (
            <button
              type="button"
              disabled={busy === product.id}
              onClick={() => void disconnect(product.id)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-xs dark:border-zinc-700"
            >
              Disconnect
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
