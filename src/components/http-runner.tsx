"use client";

import { useMemo, useState } from "react";
import { ensureOpenApiAuth } from "@/lib/credential-placeholders";
import { connectionRequiredMessage } from "@/lib/api-credentials";
import { isPlaceholderBase } from "@/lib/demo";
import {
  needsConfiguredBaseUrl,
  responseRunHint,
  templateTenantExplanation,
} from "@/lib/run-feedback";
import { proxyHttpRequest } from "@/lib/http-run";
import { parseHttpSnippet, type ExecRequest } from "@/lib/parse-request";
import {
  applyPathParams,
  credFieldsForExec,
  credFieldsForRequest,
  previewRequest,
  resolveExec,
  resolveStructured,
  unresolvedPathParams,
  type CredField,
} from "@/lib/resolve-request";
import { isMutating, maskText } from "@/lib/security";
import { summarizeCreateTagResponse, summarizeTagLookup } from "@/lib/tag-lookup";
import type { KeyValue, RunnableRequest } from "@/lib/types";
import { captureStepOutput, loadWorkflowContext } from "@/lib/workflow-step-context";
import {
  buildPlaygroundExec,
  previewPlaygroundRequest,
  useRequestPlayground,
} from "./RequestPlayground";
import { ApiConnectionPanel } from "./ApiConnectionPanel";
import { useProduct } from "./ProductContext";
import { useRunSettings } from "./RunSettings";
import {
  editableQueryParams,
  formatMaybeJson,
  ManualCredentialsForm,
  PathParamEditor,
  PayloadEditor,
  PlayIcon,
  Pre,
  QueryParamEditor,
  ResultBox,
  RunButton,
  validateJson,
  type HttpResult,
} from "./runners-shared";

export function HttpRunner({ code, request }: { code: string; request?: RunnableRequest }) {
  const settings = useRunSettings();
  const { productId } = useProduct();
  const { baseUrl, secretValues, ensureFreshAuth, credentialsConfigured } = settings;
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

  const needsBaseUrl = isPlaceholderBase(baseUrl) || needsConfiguredBaseUrl(baseUrl);

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
    if (!credentialsConfigured) {
      setError(connectionRequiredMessage(method, productId));
      setPhase("idle");
      return;
    }

    if (needsBaseUrl) {
      setError("Set your tenant base URL in the connection panel before running.");
      setPhase("idle");
      return;
    }

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
    if (!credentialsConfigured) {
      setError(connectionRequiredMessage(method, productId));
      return;
    }
    if (needsBaseUrl) {
      setError("Set your tenant base URL in the connection panel before running.");
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

  const canRun = !parseFailed && credentialsConfigured && !needsBaseUrl;

  const showBody =
    !usingPlayground &&
    method !== "GET" &&
    method !== "HEAD" &&
    (bodyText !== "" || request?.body !== undefined);

  return (
    <div>
      {usingPlayground ? (
        <>
          <p className="mt-1 text-[11px] opacity-60">
            Uses values from <strong>Request parameters</strong> above.
          </p>
          {needsConfiguredBaseUrl(baseUrl) ? (
            <div className="mt-2 rounded-md border border-amber-400/50 bg-amber-50/50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/20 dark:text-amber-400">
              <strong>Configure your tenant URL.</strong> {templateTenantExplanation()}
            </div>
          ) : null}
        </>
      ) : (
        <>
          <ApiConnectionPanel method={method} />

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
        <RunButton onClick={handleRun} busy={phase === "loading"} disabled={!canRun}>
          <PlayIcon />
          {phase === "loading" ? "Running…" : "Run"}
        </RunButton>
        <span className="text-[11px] opacity-50">
          {method} · {baseUrl || "set base URL"}
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
          {responseRunHint(result.status, result.body, baseUrl, productId) ? (
            <div className="mb-2 rounded-md border border-amber-400/50 bg-amber-50/50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              {responseRunHint(result.status, result.body, baseUrl, productId)}
            </div>
          ) : null}
          <Pre text={maskText(formatMaybeJson(result.body), secretValues)} />
        </ResultBox>
      ) : null}
    </div>
  );
}

/* -------------------------------- JSON ----------------------------------- */

