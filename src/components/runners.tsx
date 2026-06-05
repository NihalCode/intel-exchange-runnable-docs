"use client";

import { useMemo, useState } from "react";
import { DISPLAY_BASE } from "@/lib/constants";
import { isPlaceholderBase, isPlaceholderRequestUrl } from "@/lib/demo";
import { runJsInSandbox } from "@/lib/js-sandbox";
import { parseHttpSnippet, type ExecRequest } from "@/lib/parse-request";
import {
  credFieldsForExec,
  credFieldsForRequest,
  needsCredential,
  previewRequest,
  resolveExec,
  resolveStructured,
  type CredField,
} from "@/lib/resolve-request";
import { isMutating, maskText } from "@/lib/security";
import type { CodeSnippet, KeyValue, RunnableRequest } from "@/lib/types";
import { PyodideRunner } from "./PyodideRunner";
import { useRunSettings } from "./RunSettings";

/* --------------------------------- shared -------------------------------- */

function ResultBox({
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

function Pre({ text }: { text: string }) {
  return (
    <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
      {text}
    </pre>
  );
}

function CredentialsForm({ fields }: { fields: CredField[] }) {
  const { getCredential, setCredential } = useRunSettings();
  if (fields.length === 0) return null;
  return (
    <div className="mt-2 rounded-md border border-amber-400/50 bg-amber-50/50 p-3 dark:bg-amber-950/20">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
        <LockIcon />
        Credentials (kept in memory only)
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {fields.map((f) => (
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
      <p className="mt-2 text-[11px] opacity-60">
        Secrets are never written to localStorage and are masked in output.
      </p>
    </div>
  );
}

function RunButton({
  onClick,
  busy,
  children,
  tone = "primary",
}: {
  onClick: () => void;
  busy?: boolean;
  children: React.ReactNode;
  tone?: "primary" | "ghost" | "danger";
}) {
  const toneClass = {
    primary: "bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-50",
    ghost: "border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800",
    danger: "bg-red-600 text-white hover:bg-red-500 disabled:opacity-50",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${toneClass}`}
    >
      {busy ? <Spinner /> : null}
      {children}
    </button>
  );
}

/* ----------------------------- Query param editor ----------------------- */

/**
 * Returns the non-credential query params from a RunnableRequest.
 * Credential params (AccessID, Signature, Expires) are handled by CredentialsForm.
 */
function editableQueryParams(query: KeyValue[]): KeyValue[] {
  return query.filter((p) => !needsCredential(p.name, p.value));
}

function QueryParamEditor({
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

function validateJson(text: string): string | null {
  if (!text.trim()) return null; // empty is OK (no body)
  try {
    JSON.parse(text);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Invalid JSON";
  }
}

function PayloadEditor({
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

interface HttpResult {
  ok: boolean;
  status: number;
  statusText: string;
  headers: { name: string; value: string }[];
  body: string;
  truncated?: boolean;
  durationMs?: number;
}

function formatMaybeJson(text: string): string {
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

function HttpRunner({ code, request }: { code: string; request?: RunnableRequest }) {
  const settings = useRunSettings();
  const { baseUrl, secretValues, demoMode } = settings;

  const parsed = useMemo<ExecRequest | null>(
    () => (request ? null : parseHttpSnippet(code)),
    [code, request]
  );
  const credFields = useMemo<CredField[]>(
    () =>
      request
        ? credFieldsForRequest(request)
        : parsed
          ? credFieldsForExec(parsed)
          : [],
    [request, parsed]
  );

  // Non-credential query params that the user can edit
  const editableParams = useMemo<KeyValue[]>(
    () => editableQueryParams(request?.query ?? []),
    [request]
  );

  // State: query param overrides (only non-credential params)
  const [queryValues, setQueryValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(editableParams.map((p) => [p.name, p.value]))
  );

  const initialBody = request ? request.body : parsed?.body;
  const method = (request?.method || parsed?.method || "GET").toUpperCase();
  const parseFailed = !request && !parsed;

  const [bodyText, setBodyText] = useState<string>(initialBody ?? "");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "confirm" | "loading">("idle");
  const [result, setResult] = useState<HttpResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const useDemo = demoMode && isPlaceholderBase(baseUrl);
  const sendDemoFlag = (url: string) =>
    isPlaceholderRequestUrl(url) || useDemo;

  function handleBodyChange(v: string) {
    setBodyText(v);
    setJsonError(validateJson(v));
  }

  function handleQueryChange(name: string, value: string) {
    setQueryValues((prev) => ({ ...prev, [name]: value }));
  }

  const buildExec = (): ExecRequest =>
    request
      ? resolveStructured(
          request,
          baseUrl,
          settings.getCredential,
          bodyText || undefined,
          queryValues
        )
      : resolveExec(parsed!, baseUrl, settings.getCredential, bodyText || undefined);

  async function execute() {
    const exec = buildExec();
    setPreview(maskText(previewRequest(exec), secretValues));
    setPhase("loading");
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: exec.method,
          url: exec.url,
          headers: exec.headers,
          body: exec.body,
          demo: sendDemoFlag(exec.url),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || `Proxy error (HTTP ${res.status}).`);
      } else {
        setResult(data as HttpResult);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setPhase("idle");
    }
  }

  function handleRun() {
    if (parseFailed) {
      setError("This snippet could not be parsed into an HTTP request.");
      return;
    }
    if (jsonError) {
      setError(`Fix the JSON body before running: ${jsonError}`);
      return;
    }
    if (isMutating(method)) {
      setPhase("confirm");
      return;
    }
    void execute();
  }

  // Show body editor for non-GET methods when there's body content or a structured request
  const showBody =
    method !== "GET" &&
    method !== "HEAD" &&
    (bodyText !== "" || request?.body !== undefined);

  return (
    <div>
      {useDemo ? (
        <div className="mt-2 rounded-md border border-sky-400/50 bg-sky-50/50 px-3 py-2 text-xs text-sky-800 dark:bg-sky-950/20 dark:text-sky-300">
          <strong>Demo mode.</strong> Responses are simulated on this server — no Cyware tenant or credentials required.
        </div>
      ) : demoMode && !isPlaceholderBase(baseUrl) ? null : !demoMode && isPlaceholderBase(baseUrl) ? (
        <div className="mt-2 rounded-md border border-amber-400/50 bg-amber-50/50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/20 dark:text-amber-400">
          <strong>Set your base URL.</strong> Enter your Cyware tenant URL in <em>API Settings</em>, or set{" "}
          <code className="font-mono">NEXT_PUBLIC_DEMO_MODE=true</code> to use simulated responses.
        </div>
      ) : null}

      {!useDemo ? <CredentialsForm fields={credFields} /> : null}

      <QueryParamEditor
        params={editableParams}
        values={queryValues}
        onChange={handleQueryChange}
      />

      {showBody ? (
        <PayloadEditor
          value={bodyText}
          onChange={handleBodyChange}
          jsonError={jsonError}
        />
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <RunButton onClick={handleRun} busy={phase === "loading"}>
          <PlayIcon />
          {phase === "loading" ? "Running…" : "Run"}
        </RunButton>
        <span className="text-[11px] opacity-50">
          {method} · base: {baseUrl || "(set base URL above)"}
        </span>
      </div>

      {phase === "confirm" ? (
        <ResultBox tone="info" title={`Confirm ${method} request`}>
          <p className="mb-2">
            This is a <strong>{method}</strong> request and may create, modify, or
            delete data on the target server. Continue?
          </p>
          <div className="flex gap-2">
            <RunButton tone="danger" onClick={() => void execute()}>
              Yes, send {method}
            </RunButton>
            <RunButton tone="ghost" onClick={() => setPhase("idle")}>
              Cancel
            </RunButton>
          </div>
        </ResultBox>
      ) : null}

      {preview && (phase === "loading" || result || error) ? (
        <ResultBox tone="neutral" title="Request sent (secrets masked)">
          <Pre text={preview} />
        </ResultBox>
      ) : null}

      {error ? (
        <ResultBox tone="error" title="Error">
          <Pre text={maskText(error, secretValues)} />
        </ResultBox>
      ) : null}

      {result ? (
        <ResultBox tone={result.ok ? "success" : "error"} title="Response">
          <div className="mb-2 font-mono text-xs">
            <span
              className={`font-semibold ${result.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
            >
              {result.status} {result.statusText}
            </span>
            {typeof result.durationMs === "number" ? (
              <span className="opacity-50"> · {result.durationMs} ms</span>
            ) : null}
            {result.truncated ? (
              <span className="text-amber-600"> · response truncated</span>
            ) : null}
          </div>
          <Pre text={maskText(formatMaybeJson(result.body), secretValues)} />
        </ResultBox>
      ) : null}
    </div>
  );
}

/* -------------------------------- JSON ----------------------------------- */

function JsonRunner({ code }: { code: string }) {
  const [status, setStatus] = useState<"idle" | "valid" | "invalid">("idle");
  const [output, setOutput] = useState("");

  function validate() {
    try {
      const parsed = JSON.parse(code);
      setOutput(JSON.stringify(parsed, null, 2));
      setStatus("valid");
    } catch (e) {
      setOutput(e instanceof Error ? e.message : "Invalid JSON.");
      setStatus("invalid");
    }
  }

  return (
    <div>
      <div className="mt-2">
        <RunButton onClick={validate} tone="ghost">
          <CheckIcon />
          Validate / Format JSON
        </RunButton>
      </div>
      {status === "valid" ? (
        <ResultBox tone="success" title="Valid JSON — formatted">
          <Pre text={output} />
        </ResultBox>
      ) : null}
      {status === "invalid" ? (
        <ResultBox tone="error" title="Invalid JSON">
          <Pre text={output} />
        </ResultBox>
      ) : null}
    </div>
  );
}

/* ----------------------------- JavaScript -------------------------------- */

function JsRunner({ code }: { code: string }) {
  const { baseUrl, secretValues, getCredential } = useRunSettings();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  // Substitute placeholder base URL + credentials into the JS code
  function prepareCode(): string {
    let out = code.replace(
      /https:\/\/tenantname\.com\/ctixapi/g,
      baseUrl.replace(/\/+$/, "")
    );
    // Substitute credential placeholders in the URL query string
    for (const key of ["AccessID", "Signature", "Expires"]) {
      const val = getCredential(key);
      if (val) {
        out = out.replace(
          new RegExp(encodeURIComponent(`<${key.toLowerCase().replace("id", " id")}>`), "gi"),
          encodeURIComponent(val)
        );
        out = out.replace(
          new RegExp(`<your ${key.toLowerCase()}>`, "gi"),
          val
        );
        out = out.replace(
          new RegExp(`"<${key.toLowerCase()}>"`, "gi"),
          JSON.stringify(val)
        );
      }
    }
    return out;
  }

  async function run() {
    setBusy(true);
    setDone(false);
    setError(undefined);
    setResult(undefined);
    setLogs([]);
    const r = await runJsInSandbox(prepareCode(), { baseUrl, secretValues });
    setLogs(r.logs || []);
    setResult(r.result);
    setError(r.error);
    setDone(true);
    setBusy(false);
  }

  return (
    <div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <RunButton onClick={run} busy={busy}>
          <PlayIcon />
          {busy ? "Running…" : "Run (sandboxed)"}
        </RunButton>
        <span className="text-[11px] opacity-50">
          Sandboxed iframe · API calls proxied server-side
        </span>
      </div>
      {done ? (
        <ResultBox tone={error ? "error" : "success"} title="Console output">
          {logs.length > 0 ? (
            <Pre text={maskText(logs.join("\n"), secretValues)} />
          ) : null}
          {result !== undefined ? (
            <div className="mt-1">
              <span className="text-[11px] opacity-60">return value: </span>
              <Pre text={maskText(result, secretValues)} />
            </div>
          ) : null}
          {error ? (
            <div className="mt-1 text-red-600 dark:text-red-400">
              <Pre text={maskText(error, secretValues)} />
            </div>
          ) : null}
          {logs.length === 0 && result === undefined && !error ? (
            <span className="text-xs opacity-60">No output.</span>
          ) : null}
        </ResultBox>
      ) : null}
    </div>
  );
}

/* ------------------------------- Shell ----------------------------------- */

function ShellNote() {
  return (
    <p className="mt-2 text-[11px] opacity-60">
      Shell commands can&apos;t be run from the browser. Use the cURL tab for the
      equivalent runnable request, or copy this snippet to your terminal.
    </p>
  );
}

/* ------------------------------ dispatcher ------------------------------- */

export function SnippetRunner({ snippet }: { snippet: CodeSnippet }) {
  switch (snippet.runKind) {
    case "http":
      return <HttpRunner code={snippet.code} request={snippet.request} />;
    case "json":
      return <JsonRunner code={snippet.code} />;
    case "javascript":
      return <JsRunner code={snippet.code} />;
    case "python":
      return <PyodideRunner code={snippet.code} />;
    case "none":
      if (/^(bash|sh|shell|zsh)$/i.test(snippet.lang)) return <ShellNote />;
      return null;
    default:
      return null;
  }
}

/* -------------------------------- icons ---------------------------------- */

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
function CheckIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
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
