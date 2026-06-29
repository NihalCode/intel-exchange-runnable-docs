"use client";

import { useMemo } from "react";
import { hasProductCredentials } from "@/lib/api-credentials";
import { baseUrlForProduct } from "@/lib/products/auth";
import { productConnectionUi, type ConnectionFieldDef } from "@/lib/products/connection-ui";
import { docsHostWarning } from "@/lib/run-feedback";
import { isMutating } from "@/lib/security";
import { useProduct } from "./ProductContext";
import { useRunSettings } from "./RunSettings";

type ApiConnectionPanelProps = {
  /** Compact single-row layout for the site header. */
  compact?: boolean;
  /** Highlight when the pending request mutates data. */
  method?: string;
  className?: string;
};

function ProductBadge({ label }: { label: string }) {
  return (
    <span className="shrink-0 rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800 dark:bg-sky-950 dark:text-sky-300">
      {label}
    </span>
  );
}

function ConnectionFieldInput({
  field,
  value,
  onChange,
  compact,
}: {
  field: ConnectionFieldDef;
  value: string;
  onChange: (v: string) => void;
  compact?: boolean;
}) {
  const compactClass = compact
    ? "hidden min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 font-mono text-xs outline-none focus:border-sky-500 sm:block sm:max-w-[7rem] md:max-w-[8.5rem] dark:border-zinc-700 dark:bg-zinc-900"
    : "rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 font-mono text-xs outline-none focus:border-sky-500 dark:border-zinc-600 dark:bg-zinc-950";

  return (
    <input
      type={field.inputType}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      title={field.label}
      spellCheck={false}
      autoComplete="off"
      className={compactClass}
    />
  );
}

export function ApiConnectionPanel({
  compact = false,
  method,
  className = "",
}: ApiConnectionPanelProps) {
  const { product } = useProduct();
  const ui = useMemo(() => productConnectionUi(product.productId), [product.productId]);
  const productDefaultUrl = baseUrlForProduct(product.productId);

  const {
    baseUrl,
    setBaseUrl,
    getConnectionValue,
    setConnectionValue,
    getCredential,
    authReady,
    authStatus,
    generateAuth,
    credentialsConfigured,
  } = useRunSettings();

  const connected = hasProductCredentials(product.productId, getCredential);
  const mutating = method ? isMutating(method) : false;
  const docsHostNote = docsHostWarning(product.productId, baseUrl);

  const statusLabel = connected
    ? authReady || !ui.usesOpenApi
      ? "Connected"
      : "Credentials saved"
    : mutating
      ? "Required to change data"
      : "Connect to run";

  const statusClass = connected
    ? authReady || !ui.usesOpenApi
      ? "bg-emerald-500"
      : "bg-amber-500"
    : mutating
      ? "bg-amber-500"
      : "bg-zinc-400";

  if (compact) {
    return (
      <div
        className={`flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2 ${className}`}
        title={`${ui.displayLabel} — ${ui.authTypeLabel}`}
      >
        <ProductBadge label={ui.shortLabel} />
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder={productDefaultUrl}
          title={`${ui.displayLabel} base URL`}
          spellCheck={false}
          className="hidden min-w-0 flex-[1.2] rounded-md border border-zinc-300 bg-white px-2 py-1 font-mono text-xs outline-none focus:border-sky-500 sm:block xl:max-w-xs dark:border-zinc-700 dark:bg-zinc-900"
        />
        {ui.fields.map((field) => (
          <ConnectionFieldInput
            key={field.kind}
            field={field}
            compact
            value={getConnectionValue(field.kind)}
            onChange={(v) => setConnectionValue(field.kind, v)}
          />
        ))}
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-zinc-500">
          <span className={`h-2 w-2 rounded-full ${statusClass}`} />
          <span className="hidden lg:inline">{statusLabel}</span>
        </span>
      </div>
    );
  }

  return (
    <div
      className={`mt-3 rounded-lg border border-zinc-200/90 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-900/40 ${className}`}
    >
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <ProductBadge label={ui.shortLabel} />
          <span className={`h-2 w-2 rounded-full ${statusClass}`} />
          <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{ui.title}</span>
          <span className="text-[11px] text-zinc-500">{statusLabel}</span>
        </div>
        {mutating && !connected ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            Credentials required for {method}
          </span>
        ) : null}
      </div>

      <p className="mb-2.5 text-[11px] leading-relaxed text-zinc-500">
        <span className="font-medium text-zinc-600 dark:text-zinc-400">{ui.authTypeLabel}</span>
        {" · "}
        Get credentials from {ui.credentialSource}.
      </p>

      {docsHostNote ? (
        <div className="mb-2.5 rounded-md border border-amber-400/50 bg-amber-50/50 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          {docsHostNote}
        </div>
      ) : null}

      <label className="mb-2 flex flex-col gap-1 text-xs">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">Base URL</span>
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder={productDefaultUrl}
          spellCheck={false}
          className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 font-mono text-xs outline-none focus:border-sky-500 dark:border-zinc-600 dark:bg-zinc-950"
        />
      </label>

      <div className={`grid gap-2 ${ui.fields.length > 1 ? "sm:grid-cols-2" : ""}`}>
        {ui.fields.map((field) => (
          <label key={field.kind} className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              {field.label}
              {field.required ? <span className="text-red-500"> *</span> : null}
            </span>
            <ConnectionFieldInput
              field={field}
              value={getConnectionValue(field.kind)}
              onChange={(v) => setConnectionValue(field.kind, v)}
            />
          </label>
        ))}
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">{ui.footnote}</p>

      {ui.usesOpenApi && connected && authStatus !== "ok" ? (
        <button
          type="button"
          onClick={() => void generateAuth()}
          disabled={authStatus === "generating"}
          className="mt-2 text-[11px] font-medium text-sky-700 underline hover:text-sky-900 disabled:opacity-50 dark:text-sky-400"
        >
          {authStatus === "generating" ? "Preparing auth…" : "Prepare auth now (optional)"}
        </button>
      ) : null}
    </div>
  );
}

export function useApiConnectionReady(): boolean {
  const { productId } = useProduct();
  const { baseUrl, getCredential } = useRunSettings();
  return hasProductCredentials(productId, getCredential) && baseUrl.trim().length > 0;
}
