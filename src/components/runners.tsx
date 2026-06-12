"use client";

import { useMemo, useState } from "react";
import {
  ensureOpenApiAuth,
  injectOpenApiAuthIntoUrl,
  isOpenApiAuthParam,
  substituteSnippetPlaceholders,
} from "@/lib/credential-placeholders";
import { DISPLAY_BASE, DISPLAY_BASE_RE } from "@/lib/constants";
import { isPlaceholderBase } from "@/lib/demo";
import { proxyHttpRequest } from "@/lib/http-run";
import { runJsInSandbox } from "@/lib/js-sandbox";
import { parseHttpSnippet, type ExecRequest } from "@/lib/parse-request";
import {
  applyPathParams,
  credFieldsForExec,
  credFieldsForRequest,
  needsCredential,
  previewRequest,
  resolveExec,
  resolveStructured,
  unresolvedPathParams,
  type CredField,
} from "@/lib/resolve-request";
import { isMutating, maskText } from "@/lib/security";
import { summarizeCreateTagResponse, summarizeTagLookup } from "@/lib/tag-lookup";
import type { CodeSnippet, KeyValue, RunnableRequest } from "@/lib/types";
import { captureStepOutput, loadWorkflowContext } from "@/lib/workflow-step-context";
import { PyodideRunner } from "./PyodideRunner";
import {
  buildPlaygroundExec,
  previewPlaygroundRequest,
  useRequestPlayground,
} from "./RequestPlayground";
import { AutoAuthNotice, useRunSettings } from "./RunSettings";

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

function ManualCredentialsForm({ fields }: { fields: CredField[] }) {
  const { getCredential, setCredential } = useRunSettings();
  const manual = fields.filter((f) => !isOpenApiAuthParam(f.name));
  if (manual.length === 0) return null;
  return (
    <div className="mt-2 rounded-md border border-amber-400/50 bg-amber-50/50 p-3 dark:bg-amber-950/20">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
        <LockIcon />
        Additional credentials
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {manual.map((f) => (
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

function PathParamEditor({
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
  const { baseUrl, secretValues, ensureFreshAuth } = settings;
  const playground = useRequestPlayground();
  const usingPlayground = !!playground && !!request;

  const parsed = useMemo<ExecRequest | null>(
    () => (request ? null : parseHttpSnippet(code)),
    [code, request]
  );
  const credFields = useMemo<CredField[]>(
    () =>
      usingPlayground
        ? playground!.credFields
        : request
          ? credFieldsForRequest(request)
          : parsed
            ? credFieldsForExec(parsed)
            : [],
    [usingPlayground, playground, request, parsed]
  );

  const pathParams = useMemo<KeyValue[]>(
    () => (usingPlayground ? playground!.pathParams : request?.pathParams ?? []),
    [usingPlayground, playground, request]
  );

  const editableParams = useMemo<KeyValue[]>(
    () =>
      usingPlayground
        ? playground!.editableParams
        : editableQueryParams(request?.query ?? []),
    [usingPlayground, playground, request]
  );

  const [pathValues, setPathValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(pathParams.map((p) => [p.name, p.value]))
  );

  const [queryValues, setQueryValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(editableParams.map((p) => [p.name, p.value]))
  );

  const initialBody = usingPlayground
    ? playground!.bodyText
    : request
      ? request.body
      : parsed?.body;
  const method = (request?.method || parsed?.method || "GET").toUpperCase();
  const parseFailed = !request && !parsed;

  const [bodyText, setBodyText] = useState<string>(initialBody ?? "");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "confirm" | "loading">("idle");
  const [result, setResult] = useState<HttpResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const needsBaseUrl = isPlaceholderBase(baseUrl);

  const stepSlug = usingPlayground ? (playground!.stepSlug ?? "") : "";

  function tagNameForSummary(): string | undefined {
    if (usingPlayground && playground!.workflowId) {
      const fromCtx = loadWorkflowContext(playground!.workflowId)._tagName;
      if (typeof fromCtx === "string" && fromCtx.trim()) return fromCtx.trim();
    }
    const qParam = queryValues.q?.trim();
    if (qParam) return qParam;
    if (stepSlug.includes("create-tag") && method === "POST" && bodyText.trim()) {
      try {
        const parsed = JSON.parse(bodyText) as { name?: string };
        if (parsed.name?.trim()) return parsed.name.trim();
      } catch {
        /* ignore */
      }
    }
    return undefined;
  }

  function tagSummaryMessage(): string | null {
    if (!result?.body) return null;
    const tagName = tagNameForSummary();
    if (!tagName) return null;
    try {
      const parsed = JSON.parse(result.body);
      if (stepSlug.includes("create-tag") && method === "POST") {
        return summarizeCreateTagResponse(parsed, tagName, result.ok);
      }
      if (stepSlug.includes("tags") && method === "GET") {
        return summarizeTagLookup(parsed, tagName).message;
      }
    } catch {
      return null;
    }
    return null;
  }

  const tagSummary = result ? tagSummaryMessage() : null;

  function handleBodyChange(v: string) {
    setBodyText(v);
    setJsonError(validateJson(v));
  }

  function handlePathChange(name: string, value: string) {
    setPathValues((prev) => ({ ...prev, [name]: value }));
  }

  function handleQueryChange(name: string, value: string) {
    setQueryValues((prev) => ({ ...prev, [name]: value }));
  }

  const buildExec = async (): Promise<ExecRequest> =>
    usingPlayground
      ? buildPlaygroundExec(playground!, baseUrl, settings.getCredential)
      : request
        ? resolveStructured(
            request,
            baseUrl,
            settings.getCredential,
            bodyText || undefined,
            queryValues,
            pathValues
          )
        : resolveExec(parsed!, baseUrl, settings.getCredential, bodyText || undefined);

  async function ensureAuthReady(): Promise<string | null> {
    return ensureOpenApiAuth(credFields, settings.getCredential, ensureFreshAuth);
  }

  async function execute() {
    const authErr = await ensureAuthReady();
    if (authErr) {
      setError(authErr);
      setPhase("idle");
      return;
    }

    const validationError = usingPlayground
      ? playground!.validateForRun()
      : request?.pathParams?.length
        ? (() => {
            const resolved = applyPathParams(request.path, request.pathParams, pathValues);
            const missing = unresolvedPathParams(resolved);
            return missing.length > 0
              ? `Missing path parameter(s): ${missing.join(", ")}. Fill in the Path Parameters fields above (e.g. an ID from a list endpoint).`
              : null;
          })()
        : null;
    if (validationError) {
      setError(validationError);
      setPhase("idle");
      return;
    }

    const exec = await buildExec();
    const previewText = usingPlayground
      ? await previewPlaygroundRequest(playground!, baseUrl, settings.getCredential)
      : previewRequest(exec);
    setPreview(maskText(previewText, secretValues));
    setPhase("loading");
    setError(null);
    setResult(null);
    try {
      const httpResult = await proxyHttpRequest(exec);
      setResult(httpResult);
      if (
        usingPlayground &&
        playground!.workflowId &&
        playground!.stepOrder &&
        httpResult.ok &&
        httpResult.body
      ) {
        try {
          captureStepOutput(
            playground!.workflowId,
            playground!.stepOrder,
            playground!.stepSlug ?? "",
            method,
            JSON.parse(httpResult.body)
          );
        } catch {
          /* non-json body */
        }
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
    const bodyErr = usingPlayground ? playground!.jsonError : jsonError;
    if (bodyErr) {
      setError(`Fix the JSON body before running: ${bodyErr}`);
      return;
    }
    if (isMutating(method)) {
      setPhase("confirm");
      return;
    }
    void execute();
  }

  const showBody =
    !usingPlayground &&
    method !== "GET" &&
    method !== "HEAD" &&
    (bodyText !== "" || request?.body !== undefined);

  return (
    <div>
      {usingPlayground ? (
        <p className="mt-1 text-[11px] opacity-60">
          Uses values from <strong>Request parameters</strong> above.
        </p>
      ) : (
        <>
          {needsBaseUrl ? (
            <div className="mt-2 rounded-md border border-amber-400/50 bg-amber-50/50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/20 dark:text-amber-400">
              <strong>Set your base URL.</strong> Enter the Cyware tenant API base in the header
              (default: <code className="font-mono">{DISPLAY_BASE}</code>).
            </div>
          ) : (
            <div className="mt-2 rounded-md border border-sky-400/50 bg-sky-50/50 px-3 py-2 text-xs text-sky-800 dark:bg-sky-950/20 dark:text-sky-300">
              <strong>Live API.</strong> Requests are sent to{" "}
              <code className="font-mono">{baseUrl}</code>.
            </div>
          )}

          <AutoAuthNotice />
          <ManualCredentialsForm fields={credFields} />

          <PathParamEditor
            params={pathParams}
            values={pathValues}
            onChange={handlePathChange}
          />

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
        </>
      )}

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
          {tagSummary ? (
            <div
              className={`mb-2 rounded-md border px-3 py-2 text-sm font-medium ${
                tagSummary.includes("already exists") || tagSummary.startsWith("Created tag")
                  ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                  : tagSummary.includes("not found")
                    ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                    : "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200"
              }`}
            >
              {tagSummary}
            </div>
          ) : null}
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
  const {
    baseUrl,
    secretValues,
    getCredential,
    ensureFreshAuth,
  } = useRunSettings();
  const playground = useRequestPlayground();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [httpResult, setHttpResult] = useState<HttpResult | null>(null);

  const jsCredFields = useMemo(() => {
    if (playground) return playground.credFields;
    const fields: CredField[] = [
      { name: "AccessID", example: "<your access id>" },
      { name: "Signature", example: "<generated signature>" },
      { name: "Expires", example: "<unix expiry>" },
    ];
    return fields;
  }, [playground]);

  function prepareCode(): string {
    let out = substituteSnippetPlaceholders(code, getCredential);
    out = out.replace(DISPLAY_BASE_RE, baseUrl.replace(/\/+$/, ""));
    out = out.replace(/const url = "([^"]+)"/g, (_m, rawUrl: string) => {
      let u = rawUrl;
      if (u.startsWith(DISPLAY_BASE)) {
        u = baseUrl.replace(/\/+$/, "") + u.slice(DISPLAY_BASE.length);
      }
      u = injectOpenApiAuthIntoUrl(u, getCredential);
      return `const url = ${JSON.stringify(u)}`;
    });
    return out;
  }

  async function runViaPlayground() {
    const validationError = playground!.validateForRun();
    if (validationError) throw new Error(validationError);

    const authErr = await ensureOpenApiAuth(
      playground!.credFields,
      getCredential,
      ensureFreshAuth
    );
    if (authErr) throw new Error(authErr);

    const exec = buildPlaygroundExec(playground!, baseUrl, getCredential);
    const data = await proxyHttpRequest(await exec);
    setHttpResult(data);
    setLogs([`${data.status} ${data.statusText}`]);
    setResult(formatMaybeJson(data.body));
  }

  async function run() {
    setBusy(true);
    setDone(false);
    setError(undefined);
    setResult(undefined);
    setHttpResult(null);
    setLogs([]);

    try {
      if (playground) {
        await runViaPlayground();
      } else {
        const authErr = await ensureOpenApiAuth(
          jsCredFields,
          getCredential,
          ensureFreshAuth
        );
        if (authErr) throw new Error(authErr);

        const r = await runJsInSandbox(prepareCode(), {
          baseUrl,
          secretValues,
          getCredential,
        });
        setLogs(r.logs || []);
        setResult(r.result);
        if (r.error) setError(r.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Run failed.");
    } finally {
      setDone(true);
      setBusy(false);
    }
  }

  return (
    <div>
      {playground ? (
        <p className="mt-1 text-[11px] opacity-60">
          Uses values from <strong>Request parameters</strong> above.
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <RunButton onClick={run} busy={busy}>
          <PlayIcon />
          {busy ? "Running…" : playground ? "Run" : "Run (sandboxed)"}
        </RunButton>
        <span className="text-[11px] opacity-50">
          {playground
            ? "Sends the resolved request via server proxy"
            : "Sandboxed iframe · API calls proxied server-side"}
        </span>
      </div>
      {done ? (
        <ResultBox tone={error ? "error" : httpResult && !httpResult.ok ? "error" : "success"} title={playground && httpResult ? "Response" : "Console output"}>
          {httpResult ? (
            <div className="mb-2 font-mono text-xs">
              <span
                className={`font-semibold ${httpResult.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
              >
                {httpResult.status} {httpResult.statusText}
              </span>
              {typeof httpResult.durationMs === "number" ? (
                <span className="opacity-50"> · {httpResult.durationMs} ms</span>
              ) : null}
            </div>
          ) : null}
          {logs.length > 0 ? (
            <Pre text={maskText(logs.join("\n"), secretValues)} />
          ) : null}
          {result !== undefined ? (
            <div className="mt-1">
              {playground ? null : (
                <span className="text-[11px] opacity-60">return value: </span>
              )}
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
