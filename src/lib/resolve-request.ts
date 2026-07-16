import { rewriteUrlWithRuntimeBase } from "./snippet-base-url";
import type { ExecRequest } from "./parse-request";
import { isSensitiveName, looksLikePlaceholder } from "./security";
import type { KeyValue, RunnableRequest } from "./types";
import type { MultipartPart } from "./multipart";
import {
  mergeQueryParameters,
  toKeyValuePairs,
  type CustomQueryParameter,
} from "./merge-query-params";

export interface CredField {
  name: string;
  example: string;
}

type GetCred = (name: string) => string;

export function needsCredential(name: string, value: string): boolean {
  return isSensitiveName(name) || looksLikePlaceholder(value || "");
}

export function credFieldsFromPairs(pairs: KeyValue[]): CredField[] {
  const out: CredField[] = [];
  const seen = new Set<string>();
  for (const p of pairs) {
    if (needsCredential(p.name, p.value)) {
      const key = p.name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ name: p.name, example: p.value });
      }
    }
  }
  return out;
}

function resolveCredValue(name: string, getCred: GetCred): string {
  const cred = getCred(name)?.trim();
  if (cred && !looksLikePlaceholder(cred)) return cred;
  return "";
}

function applyCreds(pairs: KeyValue[], getCred: GetCred): KeyValue[] {
  return pairs.map((p) =>
    needsCredential(p.name, p.value)
      ? { name: p.name, value: resolveCredValue(p.name, getCred) }
      : p
  );
}

/** Auth query params still using placeholders or missing values. */
export function missingAuthCredentials(
  pairs: KeyValue[],
  getCred: GetCred
): string[] {
  const missing: string[] = [];
  for (const p of pairs) {
    if (!needsCredential(p.name, p.value)) continue;
    if (!resolveCredValue(p.name, getCred)) missing.push(p.name);
  }
  return missing;
}

function joinBase(base: string, path: string): string {
  const b = (base || "").replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

/** Replace `{param}` segments in a path template. */
export function applyPathParams(
  template: string,
  params: KeyValue[] | undefined,
  overrides?: Record<string, string>
): string {
  let out = template;
  for (const p of params ?? []) {
    const value =
      overrides && Object.prototype.hasOwnProperty.call(overrides, p.name)
        ? overrides[p.name]
        : p.value ?? "";
    if ((value ?? "").trim() === "") continue;
    out = out.replaceAll(`{${p.name}}`, encodeURIComponent(value.trim()));
  }
  if (overrides) {
    for (const [name, value] of Object.entries(overrides)) {
      if ((value ?? "").trim() === "") continue;
      if (params?.some((p) => p.name === name)) continue;
      out = out.replaceAll(`{${name}}`, encodeURIComponent(value.trim()));
    }
  }
  return out;
}

/** `{param}` segments still present after substitution. */
export function unresolvedPathParams(path: string): string[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
}

function queryString(pairs: KeyValue[]): string {
  if (pairs.length === 0) return "";
  return (
    "?" +
    pairs
      .map((p) => `${encodeURIComponent(p.name)}=${encodeURIComponent(p.value)}`)
      .join("&")
  );
}

/** Credential fields for a structured endpoint request. */
export function credFieldsForRequest(req: RunnableRequest): CredField[] {
  return credFieldsFromPairs([...(req.query || []), ...(req.headers || [])]);
}

/** Credential fields for a parsed (absolute-URL) request. */
export function credFieldsForExec(exec: ExecRequest): CredField[] {
  const pairs: KeyValue[] = [...exec.headers];
  try {
    const u = new URL(exec.url);
    u.searchParams.forEach((value, name) => pairs.push({ name, value }));
  } catch {
    /* ignore unparseable url */
  }
  return credFieldsFromPairs(pairs);
}

function splitQuerySources(req: RunnableRequest) {
  const allQuery = req.query || [];
  const documented = allQuery.filter((p) => !needsCredential(p.name, p.value));
  const authParams = allQuery
    .filter((p) => needsCredential(p.name, p.value))
    .map((p) => ({ ...p, source: "auth" as const, sensitive: true }));
  return { documented, authParams };
}

/** Merged query params for snippets/runners (no credential substitution). */
export function effectiveQueryKeyValues(
  req: RunnableRequest,
  queryOverrides?: Record<string, string>,
  customQueryParams?: CustomQueryParameter[]
): KeyValue[] {
  const { documented, authParams } = splitQuerySources(req);
  if (customQueryParams && customQueryParams.length > 0) {
    return toKeyValuePairs(
      mergeQueryParameters({
        documented,
        auth: authParams,
        custom: customQueryParams,
        valueOverrides: queryOverrides,
      })
    );
  }
  const merged = (req.query || []).map((p) =>
    queryOverrides && Object.prototype.hasOwnProperty.call(queryOverrides, p.name)
      ? { name: p.name, value: queryOverrides[p.name] }
      : p
  );
  return merged.filter((p) => (p.value ?? "").trim() !== "");
}

export function queryStringForRequest(
  req: RunnableRequest,
  queryOverrides?: Record<string, string>,
  customQueryParams?: CustomQueryParameter[]
): string {
  return queryString(effectiveQueryKeyValues(req, queryOverrides, customQueryParams));
}

export function resolveStructured(
  req: RunnableRequest,
  baseUrl: string,
  getCred: GetCred,
  bodyOverride?: string,
  /** User-edited values for non-credential query params. Key = param name (exact case). */
  queryOverrides?: Record<string, string>,
  /** User-edited values for `{name}` path segments. */
  pathOverrides?: Record<string, string>,
  multipartParts?: MultipartPart[],
  customQueryParams?: CustomQueryParameter[]
): ExecRequest {
  const { documented, authParams } = splitQuerySources(req);

  let query: KeyValue[];
  if (customQueryParams && customQueryParams.length > 0) {
    const merged = mergeQueryParameters({
      documented,
      auth: authParams,
      custom: customQueryParams,
      valueOverrides: queryOverrides,
    });
    query = applyCreds(toKeyValuePairs(merged), getCred).filter(
      (p) => (p.value ?? "").trim() !== ""
    );
  } else {
    const mergedQuery = (req.query || []).map((p) =>
      queryOverrides && Object.prototype.hasOwnProperty.call(queryOverrides, p.name)
        ? { name: p.name, value: queryOverrides[p.name] }
        : p
    );
    query = applyCreds(mergedQuery, getCred).filter(
      (p) => (p.value ?? "").trim() !== ""
    );
  }
  const headers = applyCreds(req.headers || [], getCred).filter(
    (h) => (h.value ?? "").trim() !== ""
  );
  const resolvedPath = applyPathParams(req.path, req.pathParams, pathOverrides);
  const url = joinBase(baseUrl, resolvedPath) + queryString(query);

  if (multipartParts && multipartParts.length > 0) {
    return {
      method: req.method,
      url,
      headers: headers.filter((h) => h.name.toLowerCase() !== "content-type"),
      multipartParts,
    };
  }

  return {
    method: req.method,
    url,
    headers,
    body: bodyOverride !== undefined ? bodyOverride : req.body,
  };
}

export function resolveExec(
  exec: ExecRequest,
  baseUrl: string,
  getCred: GetCred,
  bodyOverride?: string
): ExecRequest {
  let url = exec.url;
  if (/^https?:\/\//i.test(url)) {
    url = rewriteUrlWithRuntimeBase(url, baseUrl);
  } else {
    url = joinBase(baseUrl, url);
  }
  try {
    const u = new URL(url);
    const entries: [string, string][] = [];
    u.searchParams.forEach((value, name) => entries.push([name, value]));
    // Rebuild query with credential substitution.
    for (const key of [...u.searchParams.keys()]) u.searchParams.delete(key);
    for (const [name, value] of entries) {
      const nv = needsCredential(name, value) ? getCred(name) || value : value;
      // Drop empty params so the server doesn't parse "" as an int.
      if ((nv ?? "").trim() === "") continue;
      u.searchParams.append(name, nv);
    }
    url = u.toString();
  } catch {
    /* leave url as-is */
  }
  const headers = applyCreds(exec.headers, getCred);
  return {
    method: exec.method,
    url,
    headers,
    body: bodyOverride !== undefined ? bodyOverride : exec.body,
  };
}

export function previewRequest(exec: ExecRequest): string {
  const lines = [`${exec.method} ${exec.url}`];
  for (const h of exec.headers) lines.push(`${h.name}: ${h.value}`);
  if (exec.multipartParts?.length) {
    lines.push("Content-Type: multipart/form-data");
    lines.push("");
    for (const p of exec.multipartParts) {
      if (p.kind === "file") {
        lines.push(`${p.name}: (file) ${p.filename ?? "upload"}`);
      } else {
        lines.push(`${p.name}: ${p.value ?? ""}`);
      }
    }
    return lines.join("\n");
  }
  if (exec.body) {
    lines.push("");
    lines.push(exec.body);
  }
  return lines.join("\n");
}
