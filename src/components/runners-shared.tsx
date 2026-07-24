"use client";

import { isOpenApiAuthParam } from "@/lib/credential-placeholders";
import { needsCredential } from "@/lib/resolve-request";
import type { CredField } from "@/lib/resolve-request";
import type { KeyValue } from "@/lib/types";
import { SignalButton, SignalInput } from "@/components/fabric";
import { useRunSettings } from "./RunSettings";

/* --------------------------------- shared -------------------------------- */

export function ResultBox({
  tone,
  title,
  children,
}: {
  tone: "neutral" | "success" | "error" | "info" | "warn";
  title: string;
  children: React.ReactNode;
}) {
  const toneClass = {
    neutral: "border-zinc-300 dark:border-zinc-700",
    success: "border-emerald-400/60 bg-emerald-50/60 dark:bg-emerald-950/20",
    error: "border-red-400/60 bg-red-50/60 dark:bg-red-950/20",
    info: "border-sky-400/60 bg-sky-50/60 dark:bg-sky-950/20",
    warn: "border-amber-400/60 bg-amber-50/60 dark:bg-amber-950/20",
  }[tone];
  return (
    <div className={`mt-2 rounded-md border ${toneClass} p-3 text-sm`}>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide opacity-70">
        {title}
      </div>
      {children}
    </div>
  );
}

export function Pre({ text }: { text: string }) {
  return (
    <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
      {text}
    </pre>
  );
}

export function ManualCredentialsForm({ fields }: { fields: CredField[] }) {
  const { getCredential, setCredential } = useRunSettings();
  const manual = fields.filter((f) => !isOpenApiAuthParam(f.name));
  if (manual.length === 0) return null;
  return (
    <div className="mt-2 rounded-[var(--radius-md)] border border-amber-400/50 bg-amber-50/50 p-3 dark:bg-amber-950/20">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
        <LockIcon />
        Additional credentials
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {manual.map((f) => (
          <SignalInput
            key={f.name}
            id={`cred-${f.name}`}
            label={f.name}
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={f.example || `Enter ${f.name}`}
            value={getCredential(f.name)}
            onChange={(e) => setCredential(f.name, e.target.value)}
            className="font-mono text-xs"
          />
        ))}
      </div>
    </div>
  );
}

export function RunButton({
  onClick,
  busy,
  disabled,
  children,
  tone = "primary",
}: {
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  tone?: "primary" | "ghost" | "danger";
}) {
  const variant = tone === "ghost" ? "ghost" : tone === "danger" ? "danger" : "primary";
  return (
    <SignalButton
      type="button"
      variant={variant}
      size="sm"
      onClick={onClick}
      disabled={disabled}
      loading={busy}
    >
      {children}
    </SignalButton>
  );
}

/* ----------------------------- Query param editor ----------------------- */

/**
 * Returns the non-credential query params from a RunnableRequest.
 * Credential params (AccessID, Signature, Expires) are handled by CredentialsForm.
 */
export function editableQueryParams(query: KeyValue[]): KeyValue[] {
  return query.filter((p) => !needsCredential(p.name, p.value));
}

export function PathParamEditor({
  params,
  values,
  onChange,
}: {
  params: KeyValue[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
}) {
  if (params.length === 0) return null;
  return (
    <div className="mt-2 rounded-md border border-violet-300 bg-violet-50/50 p-3 dark:border-violet-800 dark:bg-violet-950/20">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
        Path Parameters
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {params.map((p) => (
          <label key={p.name} className="flex flex-col gap-1 text-xs">
            <span className="font-medium opacity-80">
              {p.name} <span className="text-violet-600 dark:text-violet-400">(required in URL)</span>
            </span>
            <input
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder={p.value || `Enter ${p.name}`}
              value={values[p.name] ?? p.value}
              onChange={(e) => onChange(p.name, e.target.value)}
              className="rounded border border-zinc-300 bg-white px-2 py-1 font-mono text-xs outline-none focus:border-violet-500 dark:border-zinc-600 dark:bg-zinc-900"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

export function QueryParamEditor({
  params,
  values,
  onChange,
}: {
  params: KeyValue[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
}) {
  if (params.length === 0) return null;
  return (
    <div className="mt-2 rounded-md border border-zinc-300 bg-zinc-50/50 p-3 dark:border-zinc-700 dark:bg-zinc-900/40">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-70">
        Query Parameters
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {params.map((p) => (
          <label key={p.name} className="flex flex-col gap-1 text-xs">
            <span className="font-medium opacity-80">{p.name}</span>
            <input
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder={p.value || `(optional)`}
              value={values[p.name] ?? p.value}
              onChange={(e) => onChange(p.name, e.target.value)}
              className="rounded border border-zinc-300 bg-white px-2 py-1 font-mono text-xs outline-none focus:border-sky-500 dark:border-zinc-600 dark:bg-zinc-900"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------- Payload editor --------------------------- */

export function validateJson(text: string): string | null {
  if (!text.trim()) return null; // empty is OK (no body)
  try {
    JSON.parse(text);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Invalid JSON";
  }
}

export function PayloadEditor({
  value,
  onChange,
  jsonError,
}: {
  value: string;
  onChange: (v: string) => void;
  jsonError: string | null;
}) {
  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-medium opacity-70">Request body (JSON)</span>
        {jsonError ? (
          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-600 dark:bg-red-900/30 dark:text-red-400">
            {jsonError}
          </span>
        ) : value.trim() ? (
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
            Valid JSON
          </span>
        ) : null}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        rows={Math.min(12, Math.max(3, value.split("\n").length + 1))}
        className={`w-full rounded border px-2 py-1 font-mono text-xs outline-none focus:border-sky-500 dark:bg-zinc-900 ${
          jsonError
            ? "border-red-400 dark:border-red-600"
            : "border-zinc-300 dark:border-zinc-600"
        }`}
      />
    </div>
  );
}

/* -------------------------------- HTTP ----------------------------------- */

export interface HttpResult {
  ok: boolean;
  status: number;
  statusText: string;
  headers: { name: string; value: string }[];
  body: string;
  truncated?: boolean;
  durationMs?: number;
}

export function formatMaybeJson(text: string): string {
  const t = (text || "").trim();
  if (!t) return "";
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      return JSON.stringify(JSON.parse(t), null, 2);
    } catch {
      /* not json */
    }
  }
  return text;
}


export function Spinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
    </svg>
  );
}
export function PlayIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
export function CheckIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export function LockIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

