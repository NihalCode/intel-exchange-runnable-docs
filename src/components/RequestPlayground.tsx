"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DISPLAY_BASE } from "@/lib/constants";
import { isPlaceholderBase } from "@/lib/demo";
import type { ExecRequest } from "@/lib/parse-request";
import {
  applyPathParams,
  credFieldsForRequest,
  needsCredential,
  previewRequest,
  resolveStructured,
  unresolvedPathParams,
  type CredField,
} from "@/lib/resolve-request";
import type { KeyValue, ParamField, RunnableRequest } from "@/lib/types";
import { useRunSettings } from "./RunSettings";

/* ----------------------------- context ---------------------------------- */

export interface RequestPlaygroundMeta {
  pathFields?: ParamField[];
  queryFields?: ParamField[];
  bodyFields?: ParamField[];
}

export interface RequestPlaygroundState {
  request: RunnableRequest;
  pathValues: Record<string, string>;
  queryValues: Record<string, string>;
  bodyText: string;
  jsonError: string | null;
  pathParams: KeyValue[];
  editableParams: KeyValue[];
  showBody: boolean;
  credFields: CredField[];
  requiredPath: Set<string>;
  requiredQuery: Set<string>;
  setPathValue: (name: string, value: string) => void;
  setQueryValue: (name: string, value: string) => void;
  setBodyText: (text: string) => void;
  validateForRun: () => string | null;
}

const RequestPlaygroundContext = createContext<RequestPlaygroundState | null>(null);

export function useRequestPlayground(): RequestPlaygroundState | null {
  return useContext(RequestPlaygroundContext);
}

function editableQueryParams(query: KeyValue[]): KeyValue[] {
  return query.filter((p) => !needsCredential(p.name, p.value));
}

function validateJson(text: string): string | null {
  if (!text.trim()) return null;
  try {
    JSON.parse(text);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Invalid JSON";
  }
}

function requiredNames(fields: ParamField[] | undefined): Set<string> {
  const out = new Set<string>();
  for (const f of fields ?? []) {
    if (f.isRequired && f.name) out.add(f.name);
  }
  return out;
}

export function RequestPlaygroundProvider({
  request,
  meta,
  children,
}: {
  request: RunnableRequest;
  meta?: RequestPlaygroundMeta;
  children: ReactNode;
}) {
  const pathParams = useMemo<KeyValue[]>(() => request.pathParams ?? [], [request.pathParams]);
  const editableParams = useMemo<KeyValue[]>(
    () => editableQueryParams(request.query ?? []),
    [request.query]
  );
  const credFields = useMemo(() => credFieldsForRequest(request), [request]);
  const requiredPath = useMemo(() => requiredNames(meta?.pathFields), [meta?.pathFields]);
  const requiredQuery = useMemo(() => requiredNames(meta?.queryFields), [meta?.queryFields]);

  const method = request.method.toUpperCase();
  const showBody =
    method !== "GET" &&
    method !== "HEAD" &&
    (request.body !== undefined || (meta?.bodyFields?.length ?? 0) > 0);

  const [pathValues, setPathValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(pathParams.map((p) => [p.name, p.value]))
  );
  const [queryValues, setQueryValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(editableParams.map((p) => [p.name, p.value]))
  );
  const [bodyText, setBodyTextState] = useState(request.body ?? "");
  const [jsonError, setJsonError] = useState<string | null>(() =>
    validateJson(request.body ?? "")
  );

  const setPathValue = useCallback((name: string, value: string) => {
    setPathValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const setQueryValue = useCallback((name: string, value: string) => {
    setQueryValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const setBodyText = useCallback((text: string) => {
    setBodyTextState(text);
    setJsonError(validateJson(text));
  }, []);

  const value = useMemo<RequestPlaygroundState>(() => {
    return {
      request,
      pathValues,
      queryValues,
      bodyText,
      jsonError,
      pathParams,
      editableParams,
      showBody,
      credFields,
      requiredPath,
      requiredQuery,
      setPathValue,
      setQueryValue,
      setBodyText,
      validateForRun: () => {
        if (jsonError) return `Fix the JSON body before running: ${jsonError}`;
        if (pathParams.length > 0) {
          const resolved = applyPathParams(request.path, request.pathParams, pathValues);
          const missing = unresolvedPathParams(resolved);
          if (missing.length > 0) {
            return `Missing path parameter(s): ${missing.join(", ")}. Fill them in above.`;
          }
        }
        for (const name of requiredPath) {
          if (!(pathValues[name] ?? "").trim()) {
            return `Path parameter "${name}" is required.`;
          }
        }
        for (const name of requiredQuery) {
          if (!(queryValues[name] ?? "").trim()) {
            return `Query parameter "${name}" is required.`;
          }
        }
        return null;
      },
    };
  }, [
    request,
    pathValues,
    queryValues,
    bodyText,
    jsonError,
    pathParams,
    editableParams,
    showBody,
    credFields,
    requiredPath,
    requiredQuery,
    setPathValue,
    setQueryValue,
    setBodyText,
  ]);

  return (
    <RequestPlaygroundContext.Provider value={value}>
      {children}
    </RequestPlaygroundContext.Provider>
  );
}

/* ----------------------------- panel UI --------------------------------- */

function LockIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

function PathParamEditor({
  params,
  values,
  required,
  onChange,
}: {
  params: KeyValue[];
  values: Record<string, string>;
  required: Set<string>;
  onChange: (name: string, value: string) => void;
}) {
  if (params.length === 0) return null;
  return (
    <div className="rounded-md border border-violet-300 bg-violet-50/50 p-3 dark:border-violet-800 dark:bg-violet-950/20">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
        Path Parameters
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {params.map((p) => (
          <label key={p.name} className="flex flex-col gap-1 text-xs">
            <span className="font-medium opacity-80">
              {p.name}{" "}
              <span className="text-violet-600 dark:text-violet-400">
                ({required.has(p.name) ? "required" : "in URL"})
              </span>
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
  required,
  onChange,
}: {
  params: KeyValue[];
  values: Record<string, string>;
  required: Set<string>;
  onChange: (name: string, value: string) => void;
}) {
  if (params.length === 0) return null;
  return (
    <div className="rounded-md border border-zinc-300 bg-zinc-50/50 p-3 dark:border-zinc-700 dark:bg-zinc-900/40">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-70">
        Query Parameters
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {params.map((p) => (
          <label key={p.name} className="flex flex-col gap-1 text-xs">
            <span className="font-medium opacity-80">
              {p.name}{" "}
              {!required.has(p.name) ? (
                <span className="font-normal text-zinc-400">(optional)</span>
              ) : (
                <span className="text-red-600 dark:text-red-400">(required)</span>
              )}
            </span>
            <input
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder={p.value || (required.has(p.name) ? `Enter ${p.name}` : "(optional)")}
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
    <div>
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
        rows={Math.min(14, Math.max(4, value.split("\n").length + 1))}
        className={`w-full rounded border px-2 py-1 font-mono text-xs outline-none focus:border-sky-500 dark:bg-zinc-900 ${
          jsonError
            ? "border-red-400 dark:border-red-600"
            : "border-zinc-300 dark:border-zinc-600"
        }`}
      />
    </div>
  );
}

function CredentialsForm({ fields }: { fields: CredField[] }) {
  const { getCredential, setCredential } = useRunSettings();
  if (fields.length === 0) return null;
  return (
    <div className="rounded-md border border-amber-400/50 bg-amber-50/50 p-3 dark:bg-amber-950/20">
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

/** Shared parameter editors shown once per endpoint page. */
export function RequestPlaygroundPanel() {
  const playground = useRequestPlayground();
  const { baseUrl } = useRunSettings();
  const needsBaseUrl = isPlaceholderBase(baseUrl);

  if (!playground) return null;

  const hasInputs =
    playground.pathParams.length > 0 ||
    playground.editableParams.length > 0 ||
    playground.showBody ||
    playground.credFields.length > 0;

  if (!hasInputs) return null;

  return (
    <div className="mb-6 space-y-3 rounded-lg border border-sky-400/40 bg-sky-50/30 p-4 dark:border-sky-800 dark:bg-sky-950/20">
      <div>
        <h3 className="text-sm font-semibold text-sky-900 dark:text-sky-100">
          Request parameters
        </h3>
        <p className="mt-1 text-xs text-sky-800/80 dark:text-sky-300/80">
          Edit values here before running any snippet below (cURL, JavaScript, or Python).
          Code blocks are reference only — your inputs above are what gets sent.
        </p>
      </div>

      {needsBaseUrl ? (
        <div className="rounded-md border border-amber-400/50 bg-amber-50/50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/20 dark:text-amber-400">
          <strong>Set your base URL.</strong> Enter the Cyware tenant API base in the header
          (default: <code className="font-mono">{DISPLAY_BASE}</code>).
        </div>
      ) : (
        <div className="rounded-md border border-sky-400/50 bg-sky-50/50 px-3 py-2 text-xs text-sky-800 dark:bg-sky-950/20 dark:text-sky-300">
          <strong>Live API.</strong> Requests go to{" "}
          <code className="font-mono">{baseUrl}</code>. Use{" "}
          <em>API Settings → Generate Auth</em> or fill credentials below.
        </div>
      )}

      <CredentialsForm fields={playground.credFields} />

      <PathParamEditor
        params={playground.pathParams}
        values={playground.pathValues}
        required={playground.requiredPath}
        onChange={playground.setPathValue}
      />

      <QueryParamEditor
        params={playground.editableParams}
        values={playground.queryValues}
        required={playground.requiredQuery}
        onChange={playground.setQueryValue}
      />

      {playground.showBody ? (
        <PayloadEditor
          value={playground.bodyText}
          onChange={playground.setBodyText}
          jsonError={playground.jsonError}
        />
      ) : null}
    </div>
  );
}

export function buildPlaygroundExec(
  playground: RequestPlaygroundState,
  baseUrl: string,
  getCredential: (name: string) => string
): ExecRequest {
  return resolveStructured(
    playground.request,
    baseUrl,
    getCredential,
    playground.bodyText || undefined,
    playground.queryValues,
    playground.pathValues
  );
}

export function previewPlaygroundRequest(
  playground: RequestPlaygroundState,
  baseUrl: string,
  getCredential: (name: string) => string
): string {
  return previewRequest(buildPlaygroundExec(playground, baseUrl, getCredential));
}
