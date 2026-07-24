"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDocumentationAuth } from "@/components/auth/DocumentationAuthProvider";
import { useRunSettings } from "@/components/RunSettings";
import {
  authenticatedFetch,
  SESSION_RECOVERY_FAILED_MESSAGE,
  type SessionRecoveryState,
} from "@/lib/authenticated-fetch";
import { clearCsrfTokenCache, getCsrfToken } from "@/lib/csrf-client";

type ProductId = "ctix" | "cftr" | "orchestrate" | "csap";
type Credential = {
  productId: ProductId;
  baseUrl: string;
  accessIdMasked: string;
  status: string;
  authorizedScopes: string[];
  validatedAt: string | null;
  expiresAt: string | null;
  validationErrorCode?: string | null;
};

const PRODUCTS: Array<{ id: ProductId; label: string; hint: string }> = [
  { id: "ctix", label: "CTIX / Intel Exchange", hint: "Tenant URL ending in /ctixapi" },
  {
    id: "cftr",
    label: "CFTR",
    hint: "Tenant Open API URL ending in /cftrapi — not cftrapi.cyware.com (docs only)",
  },
  {
    id: "orchestrate",
    label: "Cyware Orchestrate",
    hint: "Tenant Open API URL, e.g. https://YOUR_TENANT.cyware.com/soarapi/openapi/",
  },
  {
    id: "csap",
    label: "CSAP",
    hint: "Tenant URL ending in /csap (preferred). Pasting …/api is OK — rewritten to …/csap. Or https://csapapi.cyware.com",
  },
];

function connectFailureMessage(
  status: number,
  data: { error?: string; code?: string; credential?: Credential },
  productId?: ProductId
): string {
  if (data.code === "DOCS_HOST_NOT_ALLOWED" || data.error?.includes("docs site")) {
    return (
      data.error ??
      (productId === "cftr"
        ? "https://cftrapi.cyware.com is docs-only. Use your tenant URL ending in /cftrapi."
        : "That host is docs-only. Use your live tenant Open API base URL.")
    );
  }
  if (data.code === "BASE_URL_NOT_ALLOWED" || data.error?.includes("not allowed")) {
    if (data.error) return data.error;
    if (productId === "csap") {
      return (
        "Base URL is not allowed for CSAP. Use a tenant URL ending in /csap, " +
        "or https://csapapi.cyware.com."
      );
    }
    if (productId === "cftr") {
      return (
        "Base URL is not allowed for CFTR. Use your tenant URL ending in /cftrapi " +
        "(not cftrapi.cyware.com)."
      );
    }
    if (productId === "orchestrate") {
      return (
        "Base URL is not allowed for Orchestrate. Use …/soarapi/openapi, …/soarapi, or …/co."
      );
    }
    if (productId === "ctix") {
      return "Base URL is not allowed for CTIX. Use a tenant URL ending in /ctixapi.";
    }
    return "Base URL is not allowed for this product. Check the tenant Open API path.";
  }
  const code = data.credential?.validationErrorCode;
  if (code === "CLOUDFLARE_BLOCKED") {
    return (
      "Cloudflare blocked the server-side connectivity check (not a credential typo). " +
      "Try from a network your tenant allows, or ask your admin to permit Open API paths."
    );
  }
  if (code === "PROVIDER_REJECTED") {
    return "Connection could not be validated. Check the Access ID, Secret Key, and that the Base URL matches that key’s tenant.";
  }
  if (code === "VALIDATION_TIMEOUT") {
    return "Connection timed out. Check the Base URL and try again.";
  }
  if (code === "CONNECTIVITY_FAILED") {
    return "Could not reach the Base URL. Check the URL and network access.";
  }
  if (status === 400 && data.error) return data.error;
  if (status === 401 || data.code === "SESSION_EXPIRED") {
    return SESSION_RECOVERY_FAILED_MESSAGE;
  }
  return "Connection could not be validated. Check the URL and credentials.";
}

/**
 * Credentials live on the product auth surface (not admin control-plane).
 * Fetch CSRF via authenticatedFetch + session recovery (same pattern as Users).
 */
async function csrfToken(): Promise<string> {
  clearCsrfTokenCache();
  const token = await getCsrfToken(true);
  if (!token) {
    throw new Error(
      "Could not initialize a secure request token. Sign in again, then retry Test & connect."
    );
  }
  return token;
}

function statusLabel(status: string | undefined): string {
  if (status === "valid") return "Connected";
  if (!status) return "Not connected";
  return status.replace(/_/g, " ");
}

export function CredentialManager() {
  const { state: authState } = useDocumentationAuth();
  const { applyProductCredentials, clearCredentials } = useRunSettings();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<ProductId>("ctix");
  const [forms, setForms] = useState<
    Record<string, { baseUrl: string; accessId: string; secretKey: string }>
  >({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Record<string, string>>({});
  const [, setRecoveryState] = useState<SessionRecoveryState>("idle");
  const csrfRef = useRef<string | null>(null);

  const connectedCount = useMemo(
    () => credentials.filter((item) => item.status === "valid").length,
    [credentials]
  );

  const product = PRODUCTS.find((item) => item.id === selectedProductId) ?? PRODUCTS[0]!;
  const credential = credentials.find((item) => item.productId === product.id);
  const form = forms[product.id] ?? { baseUrl: "", accessId: "", secretKey: "" };

  async function load() {
    const response = await authenticatedFetch("/api/authentication/credentials", {
      cache: "no-store",
      redirectOnFailure: false,
      treatBare401AsSessionExpired: true,
      onRecoveryStateChange: setRecoveryState,
    });
    if (response.ok) {
      const data = (await response.json()) as {
        credentials: Credential[];
        csrfToken?: string;
      };
      setCredentials(data.credentials);
      if (data.csrfToken) csrfRef.current = data.csrfToken;
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

  async function ensureCsrf(): Promise<string> {
    if (csrfRef.current) return csrfRef.current;
    const token = await csrfToken();
    csrfRef.current = token;
    return token;
  }

  async function connect(productId: ProductId) {
    const formValues = forms[productId];
    if (!formValues?.baseUrl?.trim()) {
      setMessage((value) => ({ ...value, [productId]: "Base URL is required." }));
      return;
    }
    if (!formValues.accessId?.trim()) {
      setMessage((value) => ({ ...value, [productId]: "Access ID is required." }));
      return;
    }
    if (!formValues.secretKey?.trim()) {
      setMessage((value) => ({ ...value, [productId]: "Secret Key is required." }));
      return;
    }
    setBusy(productId);
    setMessage((value) => ({ ...value, [productId]: "" }));
    try {
      const body = JSON.stringify({ productId, ...formValues });
      const response = await authenticatedFetch("/api/authentication/credentials", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": await ensureCsrf(),
        },
        body,
        treatBare401AsSessionExpired: true,
        onRecoveryStateChange: (next) => {
          setRecoveryState(next);
          if (next === "recovering") {
            csrfRef.current = null;
            clearCsrfTokenCache();
          }
        },
        prepareRetry: async (init) => {
          csrfRef.current = null;
          clearCsrfTokenCache();
          const token = await ensureCsrf();
          return {
            ...init,
            headers: {
              ...(init.headers as Record<string, string>),
              "Content-Type": "application/json",
              "X-CSRF-Token": token,
            },
            body,
          };
        },
      });
      const data = (await response.json()) as {
        credential?: Credential;
        error?: string;
        code?: string;
      };
      const connected = response.ok && data.credential?.status === "valid";
      if (connected) {
        const connectedBaseUrl = data.credential?.baseUrl?.trim() || formValues.baseUrl;
        applyProductCredentials(productId, {
          ...formValues,
          baseUrl: connectedBaseUrl,
        });
        setForms((current) => ({
          ...current,
          [productId]: {
            ...current[productId]!,
            baseUrl: connectedBaseUrl,
            secretKey: "",
          },
        }));
        const rewritten =
          connectedBaseUrl.replace(/\/+$/, "") !== formValues.baseUrl.trim().replace(/\/+$/, "");
        setMessage((value) => ({
          ...value,
          [productId]: rewritten
            ? `Connected using ${connectedBaseUrl} (normalized from your paste). Credentials stay in memory for this tab only.`
            : "Connected. Credentials are in memory for this browser tab only — re-enter them after closing the tab.",
        }));
      } else {
        // Keep Secret Key on failure so the user can retry without retyping.
        setMessage((value) => ({
          ...value,
          [productId]: connectFailureMessage(response.status, data, productId),
        }));
      }
      await load();
    } catch (err) {
      const detail =
        err instanceof Error && err.message.trim()
          ? err.message.trim()
          : "Connection could not be validated. Check the URL and credentials.";
      setMessage((value) => ({
        ...value,
        [productId]: detail,
      }));
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(productId: ProductId) {
    setBusy(productId);
    try {
      await authenticatedFetch(`/api/authentication/credentials?productId=${productId}`, {
        method: "DELETE",
        headers: { "X-CSRF-Token": await ensureCsrf() },
        treatBare401AsSessionExpired: true,
        onRecoveryStateChange: setRecoveryState,
        prepareRetry: async (init) => {
          csrfRef.current = null;
          clearCsrfTokenCache();
          const token = await ensureCsrf();
          return {
            ...init,
            headers: {
              ...(init.headers as Record<string, string>),
              "X-CSRF-Token": token,
            },
          };
        },
      });
      clearCredentials();
      setForms((current) => ({
        ...current,
        [productId]: { baseUrl: "", accessId: "", secretKey: "" },
      }));
      await load();
    } finally {
      setBusy(null);
    }
  }

  const localPreview = authState.authProvider === "disabled";

  return (
    <div
      className="mx-auto max-w-2xl space-y-6"
      data-testid="credential-manager"
      data-layout="cx-credential-workspace"
    >
      {localPreview ? (
        <p
          className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 py-2 text-xs text-[var(--text-secondary)]"
          role="status"
        >
          Local preview mode — credentials are optional for reading docs and Ask AI. Connect a
          product here to run live API calls from code snippets.
        </p>
      ) : null}
      <div className="cx-card bg-[var(--surface-sunken)] p-4">
        <label className="block text-xs font-semibold text-[var(--text-secondary)]">
          Product
        </label>
        <select
          value={selectedProductId}
          onChange={(event) => setSelectedProductId(event.target.value as ProductId)}
          className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-medium text-[var(--text-primary)]"
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
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          {connectedCount} of {PRODUCTS.length} products connected. Select a product to view or
          update its credentials.
        </p>
      </div>

      <section className="cx-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-[var(--text-heading)]">{product.label}</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">{product.hint}</p>
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              credential?.status === "valid"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                : "bg-[var(--surface-muted)] text-[var(--text-secondary)]"
            }`}
          >
            {statusLabel(credential?.status)}
          </span>
        </div>

        {credential ? (
          <div className="mt-4 space-y-1 text-xs text-[var(--text-secondary)]">
            <p className="break-all">Base URL: {credential.baseUrl}</p>
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
          <label className="block text-xs text-[var(--text-secondary)]">
            <span>Environment / Base URL</span>
            <input
              value={form.baseUrl}
              onChange={(event) => update(product.id, "baseUrl", event.target.value)}
              placeholder="https://your-tenant.cyware.com/…"
              className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-transparent px-3 py-2 text-sm text-[var(--text-primary)]"
            />
          </label>
          <label className="block text-xs text-[var(--text-secondary)]">
            <span>Access ID</span>
            <input
              value={form.accessId}
              onChange={(event) => update(product.id, "accessId", event.target.value)}
              autoComplete="off"
              className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-transparent px-3 py-2 text-sm text-[var(--text-primary)]"
            />
          </label>
          <label className="block text-xs text-[var(--text-secondary)]">
            <span>Secret Key</span>
            <input
              type="password"
              value={form.secretKey}
              onChange={(event) => update(product.id, "secretKey", event.target.value)}
              autoComplete="new-password"
              className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-transparent px-3 py-2 text-sm text-[var(--text-primary)]"
            />
          </label>
        </div>

        {message[product.id] ? (
          <p className="mt-3 text-xs text-[var(--text-secondary)]" role="status">
            {message[product.id]}
          </p>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={busy === product.id}
            onClick={() => void connect(product.id)}
            className="rounded-[var(--radius-md)] bg-[var(--accent-primary)] px-3 py-2 text-xs font-medium text-white hover:bg-[var(--accent-primary-hover)] disabled:opacity-50"
          >
            {busy === product.id ? "Testing…" : "Test & connect"}
          </button>
          {credential ? (
            <button
              type="button"
              disabled={busy === product.id}
              onClick={() => void disconnect(product.id)}
              className="rounded-[var(--radius-md)] border border-[var(--border-default)] px-3 py-2 text-xs text-[var(--text-primary)]"
            >
              Disconnect
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
