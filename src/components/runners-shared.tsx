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
    neutral: "border-[var(--border-default)] bg-[var(--surface-muted)]",
    success:
      "border-[color-mix(in_srgb,var(--success)_50%,var(--border-default))] bg-[color-mix(in_srgb,var(--success)_10%,transparent)]",
    error:
      "border-[color-mix(in_srgb,var(--danger)_50%,var(--border-default))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]",
    info:
      "border-[color-mix(in_srgb,var(--atlas-signal)_45%,var(--border-default))] bg-[color-mix(in_srgb,var(--atlas-signal)_10%,transparent)]",
    warn:
      "border-[color-mix(in_srgb,var(--atlas-amber)_50%,var(--border-default))] bg-[color-mix(in_srgb,var(--atlas-amber)_10%,transparent)]",
  }[tone];
  return (
    <div className={`mt-2 rounded-[var(--radius-sm)] border ${toneClass} p-3 text-sm`}>
      <div className="atlas-micro-label mb-1">{title}</div>
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
    <div className="mt-2 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--atlas-amber)_45%,var(--border-default))] bg-[color-mix(in_srgb,var(--atlas-amber)_10%,transparent)] p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[var(--atlas-amber)]">
        <LockIcon />
        <span className="atlas-micro-label !inline text-[var(--atlas-amber)]">
          Additional credentials
        </span>
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
    <div className="mt-2 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--atlas-violet)_35%,var(--border-default))] bg-[color-mix(in_srgb,var(--atlas-violet)_8%,var(--surface-raised))] p-3">
      <div className="atlas-micro-label mb-2 text-[var(--atlas-violet)]">Path Parameters</div>
      <div className="grid gap-2 sm:grid-cols-2">
        {params.map((p) => (
          <label key={p.name} className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-[var(--text-secondary)]">
              {p.name}{" "}
              <span className="text-[var(--atlas-violet)]">(required in URL)</span>
            </span>
            <input
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder={p.value || `Enter ${p.name}`}
              value={values[p.name] ?? p.value}
              onChange={(e) => onChange(p.name, e.target.value)}
              className="rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-2 py-1 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--atlas-violet)]"
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
    <div className="mt-2 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--surface-muted)] p-3">
      <div className="atlas-micro-label mb-2">Query Parameters</div>
      <div className="grid gap-2 sm:grid-cols-2">
        {params.map((p) => (
          <label key={p.name} className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-[var(--text-secondary)]">{p.name}</span>
            <input
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder={p.value || `(optional)`}
              value={values[p.name] ?? p.value}
              onChange={(e) => onChange(p.name, e.target.value)}
              className="rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-2 py-1 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--atlas-signal)]"
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
        <span className="atlas-micro-label !inline">Request body (JSON)</span>
        {jsonError ? (
          <span className="rounded-[var(--radius-sm)] bg-[var(--surface-critical)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--danger)]">
            {jsonError}
          </span>
        ) : value.trim() ? (
          <span className="rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--success)_14%,transparent)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--success)]">
            Valid JSON
          </span>
        ) : null}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        rows={Math.min(12, Math.max(3, value.split("\n").length + 1))}
        className={`w-full rounded-[var(--radius-sm)] border bg-[var(--surface-raised)] px-2 py-1 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--atlas-signal)] ${
          jsonError ? "border-[var(--danger)]" : "border-[var(--border-default)]"
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

