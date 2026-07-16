"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  loadPlaygroundDraft,
  mergeBodyText,
  mergeStringRecords,
  savePlaygroundDraft,
} from "@/lib/playground-session";
import {
  resolveWorkflowBodyText,
  validateWorkflowTokens,
} from "@/lib/workflow-step-context";
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
import {
  attachFileData,
  buildMultipartParts,
  initialFormTextValues,
  validateMultipartForRun,
} from "@/lib/multipart";
import { ApiConnectionPanel } from "./ApiConnectionPanel";
import { useRunSettings } from "./RunSettings";
import { isCustomSnippetQueryParamsEnabledClient } from "@/lib/domains/client-gates";
import type { CustomQueryParameter } from "@/lib/merge-query-params";

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
  customQueryParams: CustomQueryParameter[];
  showCustomQueryParams: boolean;
  showBody: boolean;
  showMultipart: boolean;
  formFields: NonNullable<RunnableRequest["formFields"]>;
  formTextValues: Record<string, string>;
  formFiles: Record<string, File | null>;
  credFields: CredField[];
  requiredPath: Set<string>;
  requiredQuery: Set<string>;
  setPathValue: (name: string, value: string) => void;
  setQueryValue: (name: string, value: string) => void;
  setCustomQueryParam: (id: string, patch: Partial<CustomQueryParameter>) => void;
  addCustomQueryParam: () => void;
  removeCustomQueryParam: (id: string) => void;
  setBodyText: (text: string) => void;
  setFormText: (name: string, value: string) => void;
  setFormFile: (name: string, file: File | null) => void;
  validateForRun: () => string | null;
  /** Agent workflow session — enables step-to-step id chaining. */
  workflowId?: string;
  stepOrder?: number;
  stepSlug?: string;
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
  storageId,
  workflowId,
  stepOrder,
  stepSlug,
  children,
}: {
  request: RunnableRequest;
  meta?: RequestPlaygroundMeta;
  /** Doc slug or agent step slug — restores path/query/body edits across navigation. */
  storageId?: string;
  workflowId?: string;
  stepOrder?: number;
  stepSlug?: string;
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
  const showMultipart = !!request.multipart && (request.formFields?.length ?? 0) > 0;
  // Stabilise with useMemo so its identity is consistent across renders; without
  // this, formFields ?? [] produces a new array every render, which causes
  // defaultFormTextValues to recompute every render, which triggers the load
  // effect every render, which resets skipNextSave.current = true every render,
  // which means the save effect always skips and edits are never persisted.
  const formFields = useMemo(() => request.formFields ?? [], [request.formFields]);
  const showBody =
    !showMultipart &&
    method !== "GET" &&
    method !== "HEAD" &&
    (request.body !== undefined || (meta?.bodyFields?.length ?? 0) > 0);

  const defaultPathValues = useMemo(
    () => Object.fromEntries(pathParams.map((p) => [p.name, p.value])),
    [pathParams]
  );
  const defaultQueryValues = useMemo(
    () => Object.fromEntries(editableParams.map((p) => [p.name, p.value])),
    [editableParams]
  );
  const defaultBodyText = request.body ?? "";
  const defaultFormTextValues = useMemo(
    () => initialFormTextValues(formFields),
    [formFields]
  );

  const showCustomQueryParams = isCustomSnippetQueryParamsEnabledClient();
  const [customQueryParams, setCustomQueryParams] = useState<CustomQueryParameter[]>([]);
  const [pathValues, setPathValues] = useState<Record<string, string>>(defaultPathValues);
  const [queryValues, setQueryValues] = useState<Record<string, string>>(defaultQueryValues);
  const [bodyText, setBodyTextState] = useState(defaultBodyText);
  const [jsonError, setJsonError] = useState<string | null>(() => validateJson(defaultBodyText));
  const [formTextValues, setFormTextValues] =
    useState<Record<string, string>>(defaultFormTextValues);
  const skipNextSave = useRef(true);

  useEffect(() => {
    skipNextSave.current = true;
    if (!storageId) return;
    const saved = loadPlaygroundDraft(storageId);
    if (!saved) return;
    const nextBody = mergeBodyText(defaultBodyText, saved.bodyText);
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setPathValues(mergeStringRecords(defaultPathValues, saved.pathValues));
      setQueryValues(mergeStringRecords(defaultQueryValues, saved.queryValues));
      setBodyTextState(nextBody);
      setJsonError(validateJson(nextBody));
      setFormTextValues(mergeStringRecords(defaultFormTextValues, saved.formTextValues));
      if (saved.customQueryParams?.length) {
        setCustomQueryParams(saved.customQueryParams);
      }
    });
    return () => {
      active = false;
    };
  }, [
    storageId,
    defaultPathValues,
    defaultQueryValues,
    defaultBodyText,
    defaultFormTextValues,
  ]);
  const [formFiles, setFormFiles] = useState<Record<string, File | null>>(() =>
    Object.fromEntries(formFields.filter((f) => f.kind === "file").map((f) => [f.name, null]))
  );

  const setPathValue = useCallback((name: string, value: string) => {
    setPathValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const setQueryValue = useCallback((name: string, value: string) => {
    setQueryValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const setCustomQueryParam = useCallback(
    (id: string, patch: Partial<CustomQueryParameter>) => {
      setCustomQueryParams((prev) =>
        prev.map((row) => (row.id === id ? { ...row, ...patch } : row))
      );
    },
    []
  );

  const addCustomQueryParam = useCallback(() => {
    setCustomQueryParams((prev) => [
      ...prev,
      {
        id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: "",
        value: "",
        enabled: true,
      },
    ]);
  }, []);

  const removeCustomQueryParam = useCallback((id: string) => {
    setCustomQueryParams((prev) => prev.filter((row) => row.id !== id));
  }, []);

  const setBodyText = useCallback((text: string) => {
    setBodyTextState(text);
    setJsonError(validateJson(text));
  }, []);

  const setFormText = useCallback((name: string, value: string) => {
    setFormTextValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const setFormFile = useCallback((name: string, file: File | null) => {
    setFormFiles((prev) => ({ ...prev, [name]: file }));
  }, []);

  useEffect(() => {
    if (!storageId) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    savePlaygroundDraft(storageId, {
      pathValues,
      queryValues,
      bodyText,
      formTextValues,
      customQueryParams,
    });
  }, [storageId, pathValues, queryValues, bodyText, formTextValues, customQueryParams]);

  const value = useMemo<RequestPlaygroundState>(() => {
    return {
      request,
      pathValues,
      queryValues,
      bodyText,
      jsonError,
      pathParams,
      editableParams,
      customQueryParams,
      showCustomQueryParams,
      showBody,
      showMultipart,
      formFields,
      formTextValues,
      formFiles,
      credFields,
      requiredPath,
      requiredQuery,
      setPathValue,
      setQueryValue,
      setCustomQueryParam,
      addCustomQueryParam,
      removeCustomQueryParam,
      setBodyText,
      setFormText,
      setFormFile,
      validateForRun: () => {
        if (showMultipart) {
          const mpErr = validateMultipartForRun(formFields, formTextValues, formFiles);
          if (mpErr) return mpErr;
        } else if (jsonError) {
          return `Fix the JSON body before running: ${jsonError}`;
        }
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
        if (workflowId && bodyText.includes("{{")) {
          const tokenErr = validateWorkflowTokens(bodyText, workflowId);
          if (tokenErr) return tokenErr;
        }
        return null;
      },
      workflowId,
      stepOrder,
      stepSlug,
    };
  }, [
    request,
    pathValues,
    queryValues,
    bodyText,
    jsonError,
    pathParams,
    editableParams,
    customQueryParams,
    showCustomQueryParams,
    showBody,
    showMultipart,
    formFields,
    formTextValues,
    formFiles,
    credFields,
    requiredPath,
    requiredQuery,
    setPathValue,
    setQueryValue,
    setCustomQueryParam,
    addCustomQueryParam,
    removeCustomQueryParam,
    setBodyText,
    setFormText,
    setFormFile,
    workflowId,
    stepOrder,
    stepSlug,
  ]);

  return (
    <RequestPlaygroundContext.Provider value={value}>
      {children}
    </RequestPlaygroundContext.Provider>
  );
}

/* ----------------------------- panel UI --------------------------------- */

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

function CustomQueryParamEditor({
  rows,
  onChange,
  onAdd,
  onRemove,
}: {
  rows: CustomQueryParameter[];
  onChange: (id: string, patch: Partial<CustomQueryParameter>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium opacity-70">Custom query parameters</span>
        <button
          type="button"
          onClick={onAdd}
          className="rounded border border-zinc-300 px-2 py-0.5 text-[11px] font-medium hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
        >
          Add parameter
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-[11px] opacity-60">Optional user-defined query parameters (auth params are protected).</p>
      ) : (
        <div className="grid gap-2">
          {rows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-end gap-2">
              <label className="flex min-w-[8rem] flex-1 flex-col gap-1 text-xs">
                <span className="opacity-70">Name</span>
                <input
                  value={row.name}
                  onChange={(e) => onChange(row.id, { name: e.target.value })}
                  className="rounded border border-zinc-300 bg-white px-2 py-1 font-mono text-xs dark:border-zinc-600 dark:bg-zinc-900"
                />
              </label>
              <label className="flex min-w-[8rem] flex-[2] flex-col gap-1 text-xs">
                <span className="opacity-70">Value</span>
                <input
                  value={row.value}
                  onChange={(e) => onChange(row.id, { value: e.target.value })}
                  className="rounded border border-zinc-300 bg-white px-2 py-1 font-mono text-xs dark:border-zinc-600 dark:bg-zinc-900"
                />
              </label>
              <label className="flex items-center gap-1 pb-1 text-xs">
                <input
                  type="checkbox"
                  checked={row.enabled}
                  onChange={(e) => onChange(row.id, { enabled: e.target.checked })}
                />
                Enabled
              </label>
              <button
                type="button"
                onClick={() => onRemove(row.id)}
                className="pb-1 text-[11px] text-red-600 hover:underline dark:text-red-400"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
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

function MultipartFormEditor({
  fields,
  textValues,
  files,
  onTextChange,
  onFileChange,
}: {
  fields: NonNullable<RunnableRequest["formFields"]>;
  textValues: Record<string, string>;
  files: Record<string, File | null>;
  onTextChange: (name: string, value: string) => void;
  onFileChange: (name: string, file: File | null) => void;
}) {
  if (fields.length === 0) return null;
  return (
    <div className="rounded-md border border-orange-300 bg-orange-50/50 p-3 dark:border-orange-800 dark:bg-orange-950/20">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-orange-800 dark:text-orange-300">
        Form data (multipart upload)
      </div>
      <div className="grid gap-3">
        {fields.map((f) =>
          f.kind === "file" ? (
            <label key={f.name} className="flex flex-col gap-1 text-xs">
              <span className="font-medium opacity-80">
                {f.name}{" "}
                <span className="font-normal text-orange-700 dark:text-orange-400">(file)</span>
              </span>
              {f.description ? (
                <span className="text-[11px] opacity-60">{f.description}</span>
              ) : null}
              <input
                type="file"
                onChange={(e) => onFileChange(f.name, e.target.files?.[0] ?? null)}
                className="text-xs file:mr-2 file:rounded file:border-0 file:bg-sky-600 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-white hover:file:bg-sky-500"
              />
              {files[f.name] ? (
                <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400">
                  Selected: {files[f.name]!.name} ({Math.round(files[f.name]!.size / 1024)} KB)
                </span>
              ) : (
                <span className="text-[11px] opacity-50">No file selected</span>
              )}
            </label>
          ) : (
            <label key={f.name} className="flex flex-col gap-1 text-xs">
              <span className="font-medium opacity-80">
                {f.name}{" "}
                <span className="font-normal text-zinc-400">(text field)</span>
              </span>
              {f.description ? (
                <span className="text-[11px] opacity-60">{f.description}</span>
              ) : null}
              <input
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder={f.defaultValue || `(optional)`}
                value={textValues[f.name] ?? f.defaultValue ?? ""}
                onChange={(e) => onTextChange(f.name, e.target.value)}
                className="rounded border border-zinc-300 bg-white px-2 py-1 font-mono text-xs outline-none focus:border-orange-500 dark:border-zinc-600 dark:bg-zinc-900"
              />
            </label>
          )
        )}
      </div>
    </div>
  );
}

/** Shared parameter editors shown once per endpoint page. */
export function RequestPlaygroundPanel() {
  const playground = useRequestPlayground();
  const { baseUrl } = useRunSettings();
  const needsBaseUrl = isPlaceholderBase(baseUrl);

  if (!playground) return null;

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
          <strong>Set your base URL.</strong> Enter your Cyware tenant API base in the connection
          panel below.
        </div>
      ) : null}

      <ApiConnectionPanel method={playground.request.method} />

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

      {playground.showCustomQueryParams ? (
        <CustomQueryParamEditor
          rows={playground.customQueryParams}
          onChange={playground.setCustomQueryParam}
          onAdd={playground.addCustomQueryParam}
          onRemove={playground.removeCustomQueryParam}
        />
      ) : null}

      {playground.showMultipart ? (
        <MultipartFormEditor
          fields={playground.formFields}
          textValues={playground.formTextValues}
          files={playground.formFiles}
          onTextChange={playground.setFormText}
          onFileChange={playground.setFormFile}
        />
      ) : null}

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

export async function buildPlaygroundExec(
  playground: RequestPlaygroundState,
  baseUrl: string,
  getCredential: (name: string) => string
): Promise<ExecRequest> {
  const customParams = playground.showCustomQueryParams ? playground.customQueryParams : undefined;
  if (playground.showMultipart) {
    const parts = buildMultipartParts(
      playground.formFields,
      playground.formTextValues,
      playground.formFiles
    );
    const withData = await attachFileData(parts, playground.formFiles);
    return resolveStructured(
      playground.request,
      baseUrl,
      getCredential,
      undefined,
      playground.queryValues,
      playground.pathValues,
      withData,
      customParams
    );
  }
  return resolveStructured(
    playground.request,
    baseUrl,
    getCredential,
    playground.workflowId
      ? resolveWorkflowBodyText(playground.bodyText || "", playground.workflowId)
      : playground.bodyText || undefined,
    playground.queryValues,
    playground.pathValues,
    undefined,
    customParams
  );
}

export async function previewPlaygroundRequest(
  playground: RequestPlaygroundState,
  baseUrl: string,
  getCredential: (name: string) => string
): Promise<string> {
  return previewRequest(await buildPlaygroundExec(playground, baseUrl, getCredential));
}
