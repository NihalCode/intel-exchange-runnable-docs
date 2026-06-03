import { DISPLAY_BASE } from "./constants";
import type { ExecRequest } from "./parse-request";
import { isSensitiveName, looksLikePlaceholder } from "./security";
import type { KeyValue, RunnableRequest } from "./types";

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

function applyCreds(pairs: KeyValue[], getCred: GetCred): KeyValue[] {
  return pairs.map((p) =>
    needsCredential(p.name, p.value)
      ? { name: p.name, value: getCred(p.name) || p.value }
      : p
  );
}

function joinBase(base: string, path: string): string {
  const b = (base || "").replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
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

export function resolveStructured(
  req: RunnableRequest,
  baseUrl: string,
  getCred: GetCred,
  bodyOverride?: string
): ExecRequest {
  const query = applyCreds(req.query || [], getCred);
  const headers = applyCreds(req.headers || [], getCred);
  const url = joinBase(baseUrl, req.path) + queryString(query);
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
  if (url.startsWith(DISPLAY_BASE)) {
    url = baseUrl.replace(/\/+$/, "") + url.slice(DISPLAY_BASE.length);
  } else if (!/^https?:\/\//i.test(url)) {
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
  if (exec.body) {
    lines.push("");
    lines.push(exec.body);
  }
  return lines.join("\n");
}
