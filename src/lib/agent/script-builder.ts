// Generates self-contained, runnable workflow scripts (Python / Node.js) from a
// linear agent plan. Unlike the per-step snippets, these scripts implement the
// WHOLE workflow as one program with:
//   - HMAC-SHA1 auth (computed at runtime, creds from env)
//   - a robust request() helper: timeout + retry/backoff on 429 & 5xx (honours Retry-After)
//   - graceful error handling
//   - step chaining: each response is stored in a context map and later steps can
//     reference earlier outputs via {{token}} / {{step2.results.0.id}} tokens
//   - conditional "find-or-create": a list/search step immediately followed by a
//     create step for the same collection becomes "find existing by name, else create"
//
// The generator is GENERIC — it works for any ordered set of endpoints, not a
// specific use case. Heuristic chaining is conservative and always reported in `notes`.

import { applyPathParams } from "../resolve-request";
import type { HttpMethod, RunnableRequest } from "../types";
import type { AgentStepResult, ScriptLanguage, WorkflowScript } from "./types";
import { extractTagNameFromQuery } from "../workflow-step-context";

const PRODUCT_ENV: Record<string, { prefix: string; label: string }> = {
  ctix: { prefix: "CTIX", label: "Intel Exchange (CTIX)" },
  csap: { prefix: "CSAP", label: "CSAP (Collaborate)" },
  orchestrate: { prefix: "ORCHESTRATE", label: "Cyware Orchestrate" },
  cftr: { prefix: "CFTR", label: "CFTR" },
};

function envForProduct(productId: string): { prefix: string; label: string } {
  return PRODUCT_ENV[productId] ?? PRODUCT_ENV.ctix;
}

const AUTH_NAMES = new Set(["AccessID", "Signature", "Expires"]);
const PATH_PREFIXES = new Set([
  "ingestion",
  "conversion",
  "api",
  "ctixapi",
  "openapi",
  "v2",
  "v3",
]);

/* ----------------------------- normalization ----------------------------- */

interface NormStep {
  index: number; // 1-based position in the original plan
  slug: string;
  title: string;
  method: HttpMethod;
  path: string; // path params already substituted where values exist
  query: Record<string, string>;
  body: unknown; // parsed JSON object/array, or undefined
  collection: string; // e.g. "tags", "threat-data"
  resource: string; // singular label, e.g. "tag"
  unresolvedPath: string[]; // names of path params left unfilled
}

function singular(word: string): string {
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.endsWith("ses")) return word.slice(0, -2);
  if (word.endsWith("s") && word.length > 3) return word.slice(0, -1);
  return word;
}

function collectionKey(path: string): string {
  const parts = path.split("/").filter((p) => p && !p.startsWith("{"));
  for (const p of parts) {
    if (!PATH_PREFIXES.has(p.toLowerCase())) return p;
  }
  return parts[0] ?? "resource";
}

function tokenName(collection: string): string {
  return `${singular(collection).replace(/[^a-z0-9]+/gi, "_")}_id`;
}

function listTokenName(collection: string): string {
  return `${singular(collection).replace(/[^a-z0-9]+/gi, "_")}_ids`;
}

function parseBody(body: string | undefined): unknown {
  if (!body || !body.trim()) return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return body; // keep raw string; runtime will send as-is
  }
}

function cleanQuery(req: RunnableRequest): Record<string, string> {
  const out: Record<string, string> = {};
  for (const kv of req.query ?? []) {
    if (AUTH_NAMES.has(kv.name)) continue;
    if ((kv.value ?? "").trim() === "") continue;
    out[kv.name] = kv.value;
  }
  return out;
}

function normalizeStep(step: AgentStepResult): NormStep {
  const req = step.request;
  const path = applyPathParams(req.path, req.pathParams);
  const unresolved = (path.match(/\{([^}]+)\}/g) ?? []).map((m) => m.slice(1, -1));
  const collection = collectionKey(req.path);
  return {
    index: step.order,
    slug: step.slug,
    title: step.title,
    method: req.method,
    path: path.replace(/^\//, ""),
    query: cleanQuery(req),
    body: parseBody(req.body),
    collection,
    resource: singular(collection).replace(/-/g, " "),
    unresolvedPath: unresolved,
  };
}

/* --------------------------- plan inference ------------------------------ */

interface CallOp {
  type: "call";
  step: NormStep;
  captureId?: string; // token to store response .id under (create steps)
  captureListIds?: string; // token to store [results[].id] under (list/search steps)
}

interface FindOrCreateOp {
  type: "findOrCreate";
  index: number;
  listStep: NormStep;
  createStep: NormStep;
  matchField: string;
  matchValue: string;
  captureName: string;
  resource: string;
}

export type ScriptOp = CallOp | FindOrCreateOp;

export interface ScriptPlan {
  ops: ScriptOp[];
  notes: string[];
}

function isListStep(s: NormStep): boolean {
  return s.method === "GET" && /\b(list|search|get|retrieve)\b/i.test(`${s.slug} ${s.title}`);
}

function isCreateStep(s: NormStep): boolean {
  return s.method === "POST" && /\b(create|add)\b/i.test(`${s.slug} ${s.title}`);
}

/** Pull a string `name` value out of a (possibly nested) create body for matching. */
function nameFromBody(body: unknown): string | undefined {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const v = (body as Record<string, unknown>).name;
    if (typeof v === "string" && v.trim()) return v;
  }
  return undefined;
}

/**
 * Recursively wire a body's id-consuming fields to previously captured tokens.
 * Returns a new body and the list of human-readable wiring notes.
 */
function wireBody(
  body: unknown,
  singles: Map<string, string>, // captureName -> token (same string)
  lists: string[] // ordered list tokens available
): { body: unknown; notes: string[] } {
  const notes: string[] = [];

  const walk = (value: unknown, keyHint?: string): unknown => {
    if (Array.isArray(value)) {
      // An array whose key looks like an id list → bind to a list capture.
      if (keyHint && /(^|_)(object_ids|ids)$/i.test(keyHint) && lists.length > 0) {
        const tok = lists[lists.length - 1];
        notes.push(`Wired "${keyHint}" → {{${tok}}} (ids from a prior list/search step)`);
        return `{{${tok}}}`;
      }
      // An array whose key matches a single id capture → [ {{token}} ].
      if (keyHint && singles.has(keyHint)) {
        const tok = singles.get(keyHint)!;
        notes.push(`Wired "${keyHint}" → [{{${tok}}}]`);
        return [`{{${tok}}}`];
      }
      return value.map((v) => walk(v));
    }
    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        out[k] = walk(v, k);
      }
      return out;
    }
    // scalar
    if (keyHint && singles.has(keyHint)) {
      const tok = singles.get(keyHint)!;
      notes.push(`Wired "${keyHint}" → {{${tok}}}`);
      return `{{${tok}}}`;
    }
    if (keyHint && /(^|_)object_id$/i.test(keyHint) && lists.length > 0) {
      const tok = lists[lists.length - 1];
      notes.push(`Wired "${keyHint}" → first of {{${tok}}}`);
      return `{{${tok}}.0}`;
    }
    return value;
  };

  return { body: walk(body), notes };
}

export function inferScriptPlan(steps: AgentStepResult[]): ScriptPlan {
  const norm = steps.map(normalizeStep);
  const ops: ScriptOp[] = [];
  const notes: string[] = [];

  const singles = new Map<string, string>();
  const lists: string[] = [];

  for (let i = 0; i < norm.length; i++) {
    const s = norm[i];
    const next = norm[i + 1];

    // find-or-create: list/search step + create step on the same collection
    if (
      next &&
      isListStep(s) &&
      isCreateStep(next) &&
      s.collection === next.collection &&
      nameFromBody(next.body)
    ) {
      const captureName = tokenName(s.collection);
      ops.push({
        type: "findOrCreate",
        index: s.index,
        listStep: s,
        createStep: next,
        matchField: "name",
        matchValue: nameFromBody(next.body)!,
        captureName,
        resource: s.resource,
      });
      singles.set(captureName, captureName);
      notes.push(
        `Steps ${s.index}+${next.index}: "find ${s.resource} by name, else create" → captures {{${captureName}}}`
      );
      i++; // consume the create step
      continue;
    }

    // ordinary call — wire any id consumers first, then register its own captures
    const wired = wireBody(s.body, singles, lists);
    if (wired.notes.length) notes.push(...wired.notes.map((n) => `Step ${s.index}: ${n}`));

    const op: CallOp = { type: "call", step: { ...s, body: wired.body } };

    if (isCreateStep(s)) {
      const tok = tokenName(s.collection);
      op.captureId = tok;
      singles.set(tok, tok);
      notes.push(`Step ${s.index}: captures created ${s.resource} id as {{${tok}}}`);
    } else if (isListStep(s)) {
      const tok = listTokenName(s.collection);
      op.captureListIds = tok;
      lists.push(tok);
      notes.push(`Step ${s.index}: captures result ids as {{${tok}}}`);
    }

    if (s.unresolvedPath.length) {
      notes.push(
        `Step ${s.index}: fill path parameter(s) ${s.unresolvedPath.join(", ")} before running`
      );
    }

    ops.push(op);
  }

  return { ops, notes };
}

/* ------------------------------ Python emit ------------------------------ */

function pyJson(value: unknown): string {
  // Embed JSON as a Python raw string parsed at runtime to preserve {{tokens}}.
  const json = JSON.stringify(value ?? null);
  const safe = json.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return `json.loads('${safe}')`;
}

const PY_RUNTIME = `#!/usr/bin/env python3
"""TITLE_PLACEHOLDER

Standalone runnable workflow generated by the Cyware docs agent.
Auth, retries/rate-limit backoff, error handling and step chaining are built in.

Usage:
    export ENV_PREFIX_ACCESS_ID=...
    export ENV_PREFIX_SECRET_KEY=...
    python workflow.py
"""
import base64, hashlib, hmac, json, os, re, sys, time
import urllib.parse, urllib.request, urllib.error

BASE_URL = os.environ.get("ENV_PREFIX_BASE_URL", "BASE_URL_PLACEHOLDER").rstrip("/")
ACCESS_ID = os.environ.get("ENV_PREFIX_ACCESS_ID", "")
SECRET_KEY = os.environ.get("ENV_PREFIX_SECRET_KEY", "")

MAX_RETRIES = 4
TIMEOUT = 30

if not ACCESS_ID or not SECRET_KEY:
    sys.exit("Set ENV_PREFIX_ACCESS_ID and ENV_PREFIX_SECRET_KEY environment variables.")

ctx = {}

def auth_params():
    expires = int(time.time()) + 20
    to_sign = "{}\\n{}".format(ACCESS_ID, expires).encode()
    sig = hmac.new(SECRET_KEY.encode(), to_sign, hashlib.sha1).digest()
    return {"AccessID": ACCESS_ID, "Expires": str(expires),
            "Signature": base64.b64encode(sig).decode()}

def _retry_after(err):
    ra = err.headers.get("Retry-After") if err.headers else None
    if ra and str(ra).isdigit():
        return int(ra)
    return None

def _parse(raw):
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"_raw": raw}

def request(method, path, query=None, body=None):
    q = {k: v for k, v in (query or {}).items() if v not in (None, "")}
    q.update(auth_params())
    url = "{}/{}".format(BASE_URL, path.lstrip("/"))
    qs = urllib.parse.urlencode(q, doseq=True)
    if qs:
        url = "{}?{}".format(url, qs)
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    for attempt in range(MAX_RETRIES + 1):
        req = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                return resp.status, _parse(resp.read().decode())
        except urllib.error.HTTPError as e:
            raw = e.read().decode(errors="replace")
            if (e.code == 429 or 500 <= e.code < 600) and attempt < MAX_RETRIES:
                wait = _retry_after(e) or (2 ** attempt)
                print("  [retry] HTTP {} - waiting {}s ({}/{})".format(e.code, wait, attempt + 1, MAX_RETRIES))
                time.sleep(wait)
                continue
            sys.exit("HTTP {} on {} {}: {}".format(e.code, method, path, raw[:500]))
        except urllib.error.URLError as e:
            if attempt < MAX_RETRIES:
                wait = 2 ** attempt
                print("  [retry] network error {} - waiting {}s".format(e.reason, wait))
                time.sleep(wait)
                continue
            sys.exit("Network error on {} {}: {}".format(method, path, e.reason))
    sys.exit("unreachable")

def dig(obj, dotted):
    cur = obj
    for part in str(dotted).split("."):
        if isinstance(cur, list):
            try:
                cur = cur[int(part)]
            except (ValueError, IndexError):
                return None
        elif isinstance(cur, dict):
            cur = cur.get(part)
        else:
            return None
    return cur

_TOKEN = re.compile(r"^\\{\\{(.+?)\\}\\}$")

def resolve(value):
    if isinstance(value, dict):
        return {k: resolve(v) for k, v in value.items()}
    if isinstance(value, list):
        return [resolve(v) for v in value]
    if isinstance(value, str):
        m = _TOKEN.match(value.strip())
        if m:
            return dig(ctx, m.group(1))
        return re.sub(r"\\{\\{(.+?)\\}\\}", lambda mo: "" if dig(ctx, mo.group(1)) is None else str(dig(ctx, mo.group(1))), value)
    return value

def find_in(items, field, value):
    for item in items or []:
        if isinstance(item, dict) and str(item.get(field)) == str(value):
            return item
    return None

def main():
    print("Base URL:", BASE_URL)
`;

function emitPythonCall(op: CallOp): string {
  const s = op.step;
  const lines: string[] = [];
  lines.push(`    print("\\n[Step ${s.index}] ${escPy(s.title)} (${s.method} ${escPy(s.path)})")`);
  const queryArg = Object.keys(s.query).length ? `resolve(${pyJson(s.query)})` : "None";
  const bodyArg = s.body !== undefined ? `resolve(${pyJson(s.body)})` : "None";
  lines.push(`    _status, _resp = request("${s.method}", resolve("${escPy(s.path)}"), ${queryArg}, ${bodyArg})`);
  lines.push(`    ctx["step${s.index}"] = _resp`);
  lines.push(`    print("  status:", _status)`);
  if (op.captureId) {
    lines.push(`    ctx["${op.captureId}"] = _resp.get("id") if isinstance(_resp, dict) else None`);
    lines.push(`    print("  ${escPy(op.step.resource)} id:", ctx["${op.captureId}"])`);
  }
  if (op.captureListIds) {
    lines.push(`    _items = dig(_resp, "results")`);
    lines.push(`    if _items is None and isinstance(_resp, list): _items = _resp`);
    lines.push(`    ctx["${op.captureListIds}"] = [i.get("id") for i in (_items or []) if isinstance(i, dict)]`);
    lines.push(`    print("  collected", len(ctx["${op.captureListIds}"]), "ids")`);
  }
  return lines.join("\n");
}

function emitPythonFindOrCreate(op: FindOrCreateOp): string {
  const l = op.listStep;
  const c = op.createStep;
  const listQuery = Object.keys(l.query).length ? `resolve(${pyJson(l.query)})` : "None";
  const createBody = c.body !== undefined ? `resolve(${pyJson(c.body)})` : "None";
  const createQuery = Object.keys(c.query).length ? `resolve(${pyJson(c.query)})` : "None";
  return [
    `    print("\\n[Step ${op.index}] find-or-create ${escPy(op.resource)}: '${escPy(op.matchValue)}'")`,
    `    _status, _list = request("GET", resolve("${escPy(l.path)}"), ${listQuery}, None)`,
    `    _items = dig(_list, "results")`,
    `    if _items is None and isinstance(_list, list): _items = _list`,
    `    _match = find_in(_items, "${escPy(op.matchField)}", "${escPy(op.matchValue)}")`,
    `    if _match:`,
    `        ctx["${op.captureName}"] = _match.get("id")`,
    `        print("  found existing ${escPy(op.resource)} id:", ctx["${op.captureName}"])`,
    `    else:`,
    `        print("  not found - creating")`,
    `        _status, _created = request("${c.method}", resolve("${escPy(c.path)}"), ${createQuery}, ${createBody})`,
    `        ctx["${op.captureName}"] = _created.get("id") if isinstance(_created, dict) else None`,
    `        print("  created ${escPy(op.resource)} id:", ctx["${op.captureName}"])`,
  ].join("\n");
}

function escPy(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function applyRuntimeEnvPrefix(template: string, productId: string, baseUrl: string, title: string): string {
  const { prefix } = envForProduct(productId);
  return template
    .replaceAll("ENV_PREFIX", prefix)
    .replace("TITLE_PLACEHOLDER", title.replace(/"/g, "'"))
    .replace("BASE_URL_PLACEHOLDER", baseUrl);
}

function buildPython(plan: ScriptPlan, baseUrl: string, title: string, productId: string): string {
  const body = plan.ops
    .map((op) => (op.type === "call" ? emitPythonCall(op) : emitPythonFindOrCreate(op)))
    .join("\n\n");
  const runtime = applyRuntimeEnvPrefix(PY_RUNTIME, productId, baseUrl, title);
  return `${runtime}${body}\n\n    print("\\nWorkflow complete.")\n\n\nif __name__ == "__main__":\n    main()\n`;
}

/* -------------------------------- JS emit -------------------------------- */

const JS_RUNTIME = `#!/usr/bin/env node
/**
 * TITLE_PLACEHOLDER
 *
 * Standalone runnable workflow generated by the Cyware docs agent.
 * Auth, retries/rate-limit backoff, error handling and step chaining are built in.
 * Requires Node.js 18+ (global fetch).
 *
 * Usage:
 *   export ENV_PREFIX_ACCESS_ID=...
 *   export ENV_PREFIX_SECRET_KEY=...
 *   node workflow.js
 */
const crypto = require("node:crypto");

const BASE_URL = (process.env.ENV_PREFIX_BASE_URL || "BASE_URL_PLACEHOLDER").replace(/\\/$/, "");
const ACCESS_ID = process.env.ENV_PREFIX_ACCESS_ID || "";
const SECRET_KEY = process.env.ENV_PREFIX_SECRET_KEY || "";
const MAX_RETRIES = 4;
const TIMEOUT_MS = 30000;

if (!ACCESS_ID || !SECRET_KEY) {
  console.error("Set ENV_PREFIX_ACCESS_ID and ENV_PREFIX_SECRET_KEY environment variables.");
  process.exit(1);
}

const ctx = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function authParams() {
  const expires = Math.floor(Date.now() / 1000) + 20;
  const sig = crypto.createHmac("sha1", SECRET_KEY).update(ACCESS_ID + "\\n" + expires).digest("base64");
  return { AccessID: ACCESS_ID, Expires: String(expires), Signature: sig };
}

function dig(obj, dotted) {
  let cur = obj;
  for (const part of String(dotted).split(".")) {
    if (Array.isArray(cur)) cur = cur[Number(part)];
    else if (cur && typeof cur === "object") cur = cur[part];
    else return undefined;
    if (cur === undefined) return undefined;
  }
  return cur;
}

function resolve(value) {
  if (Array.isArray(value)) return value.map(resolve);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolve(v);
    return out;
  }
  if (typeof value === "string") {
    const exact = value.trim().match(/^\\{\\{(.+?)\\}\\}$/);
    if (exact) return dig(ctx, exact[1]);
    return value.replace(/\\{\\{(.+?)\\}\\}/g, (_, t) => {
      const v = dig(ctx, t);
      return v === undefined || v === null ? "" : String(v);
    });
  }
  return value;
}

function findIn(items, field, value) {
  for (const item of items || []) {
    if (item && typeof item === "object" && String(item[field]) === String(value)) return item;
  }
  return null;
}

async function request(method, path, query, body) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query || {})) {
    if (v === null || v === undefined || v === "") continue;
    if (Array.isArray(v)) v.forEach((x) => q.append(k, String(x)));
    else q.append(k, String(v));
  }
  for (const [k, v] of Object.entries(authParams())) q.append(k, v);
  let url = BASE_URL + "/" + path.replace(/^\\//, "");
  const qs = q.toString();
  if (qs) url += "?" + qs;
  const init = { method, headers: { Accept: "application/json" } };
  if (body !== undefined && body !== null) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      const raw = await res.text();
      let parsed;
      try { parsed = raw ? JSON.parse(raw) : {}; } catch { parsed = { _raw: raw }; }
      if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000;
        console.log("  [retry] HTTP " + res.status + " - waiting " + wait / 1000 + "s (" + (attempt + 1) + "/" + MAX_RETRIES + ")");
        await sleep(wait);
        continue;
      }
      if (!res.ok) {
        console.error("HTTP " + res.status + " on " + method + " " + path + ": " + raw.slice(0, 500));
        process.exit(1);
      }
      return { status: res.status, data: parsed };
    } catch (err) {
      clearTimeout(timer);
      if (attempt < MAX_RETRIES) {
        const wait = 2 ** attempt * 1000;
        console.log("  [retry] " + (err.name === "AbortError" ? "timeout" : err.message) + " - waiting " + wait / 1000 + "s");
        await sleep(wait);
        continue;
      }
      console.error("Network error on " + method + " " + path + ": " + err.message);
      process.exit(1);
    }
  }
}

async function main() {
  console.log("Base URL:", BASE_URL);
`;

function escJs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function jsJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function emitJsCall(op: CallOp): string {
  const s = op.step;
  const lines: string[] = [];
  lines.push(`  console.log("\\n[Step ${s.index}] ${escJs(s.title)} (${s.method} ${escJs(s.path)})");`);
  const queryArg = Object.keys(s.query).length ? `resolve(${jsJson(s.query)})` : "null";
  const bodyArg = s.body !== undefined ? `resolve(${jsJson(s.body)})` : "null";
  lines.push(`  {`);
  lines.push(`    const { status, data } = await request("${s.method}", resolve("${escJs(s.path)}"), ${queryArg}, ${bodyArg});`);
  lines.push(`    ctx["step${s.index}"] = data;`);
  lines.push(`    console.log("  status:", status);`);
  if (op.captureId) {
    lines.push(`    ctx["${op.captureId}"] = data && typeof data === "object" ? data.id : undefined;`);
    lines.push(`    console.log("  ${escJs(op.step.resource)} id:", ctx["${op.captureId}"]);`);
  }
  if (op.captureListIds) {
    lines.push(`    let _items = dig(data, "results");`);
    lines.push(`    if (_items === undefined && Array.isArray(data)) _items = data;`);
    lines.push(`    ctx["${op.captureListIds}"] = (_items || []).filter((i) => i && typeof i === "object").map((i) => i.id);`);
    lines.push(`    console.log("  collected", ctx["${op.captureListIds}"].length, "ids");`);
  }
  lines.push(`  }`);
  return lines.join("\n");
}

function emitJsFindOrCreate(op: FindOrCreateOp): string {
  const l = op.listStep;
  const c = op.createStep;
  const listQuery = Object.keys(l.query).length ? `resolve(${jsJson(l.query)})` : "null";
  const createBody = c.body !== undefined ? `resolve(${jsJson(c.body)})` : "null";
  const createQuery = Object.keys(c.query).length ? `resolve(${jsJson(c.query)})` : "null";
  return [
    `  console.log("\\n[Step ${op.index}] find-or-create ${escJs(op.resource)}: '${escJs(op.matchValue)}'");`,
    `  {`,
    `    const { data: _list } = await request("GET", resolve("${escJs(l.path)}"), ${listQuery}, null);`,
    `    let _items = dig(_list, "results");`,
    `    if (_items === undefined && Array.isArray(_list)) _items = _list;`,
    `    const _match = findIn(_items, "${escJs(op.matchField)}", "${escJs(op.matchValue)}");`,
    `    if (_match) {`,
    `      ctx["${op.captureName}"] = _match.id;`,
    `      console.log("  found existing ${escJs(op.resource)} id:", ctx["${op.captureName}"]);`,
    `    } else {`,
    `      console.log("  not found - creating");`,
    `      const { data: _created } = await request("${c.method}", resolve("${escJs(c.path)}"), ${createQuery}, ${createBody});`,
    `      ctx["${op.captureName}"] = _created && typeof _created === "object" ? _created.id : undefined;`,
    `      console.log("  created ${escJs(op.resource)} id:", ctx["${op.captureName}"]);`,
    `    }`,
    `  }`,
  ].join("\n");
}

function buildJavascript(plan: ScriptPlan, baseUrl: string, title: string, productId: string): string {
  const body = plan.ops
    .map((op) => (op.type === "call" ? emitJsCall(op) : emitJsFindOrCreate(op)))
    .join("\n\n");
  const runtime = applyRuntimeEnvPrefix(
    JS_RUNTIME,
    productId,
    baseUrl,
    title.replace(/\*\//g, "* /")
  );
  return `${runtime}${body}\n\n  console.log("\\nWorkflow complete.");\n}\n\nmain().catch((e) => { console.error(e); process.exit(1); });\n`;
}

/* -------------------------------- public --------------------------------- */

function enrichQuery(query: { name: string; value: string }[], extra: Record<string, string>) {
  const map = new Map(query.map((q) => [q.name, q.value]));
  for (const [name, value] of Object.entries(extra)) {
    if (!map.get(name)?.trim()) map.set(name, value);
  }
  return [...map.entries()].map(([name, value]) => ({ name, value }));
}

function mergePathParams(
  params: { name: string; value: string }[] | undefined,
  overrides: Record<string, string>
) {
  const map = new Map((params ?? []).map((p) => [p.name, p.value]));
  for (const [name, value] of Object.entries(overrides)) {
    map.set(name, value);
  }
  return [...map.entries()].map(([name, value]) => ({ name, value }));
}

/** Pre-fill step request bodies/path params for chaining (UI + scripts). */
export function applyScriptPlanToSteps(
  steps: AgentStepResult[],
  query?: string
): AgentStepResult[] {
  if (steps.length === 0) return steps;
  const tagName = query ? extractTagNameFromQuery(query) : undefined;
  const plan = inferScriptPlan(steps);

  const bodyByOrder = new Map<number, unknown>();
  const pathByOrder = new Map<number, Record<string, string>>();

  for (const op of plan.ops) {
    if (op.type === "call") {
      bodyByOrder.set(op.step.index, op.step.body);
      if (op.step.slug.includes("bulk-add-remove-tags")) {
        pathByOrder.set(op.step.index, { action_type: "add_tag" });
      }
    }
    if (op.type === "findOrCreate") {
      bodyByOrder.set(op.listStep.index, op.listStep.body);
      const createBody =
        op.createStep.body && typeof op.createStep.body === "object" && !Array.isArray(op.createStep.body)
          ? { ...(op.createStep.body as Record<string, unknown>), ...(tagName ? { name: tagName } : {}) }
          : tagName
            ? { name: tagName, colour_code: "#0068FA" }
            : op.createStep.body;
      bodyByOrder.set(op.createStep.index, createBody);
    }
  }

  return steps.map((s) => {
    let request = { ...s.request };

    if (s.slug.includes("list-threat-data")) {
      request = {
        ...request,
        query: enrichQuery(request.query ?? [], { page_size: "100", page: "1" }),
      };
    }

    if (tagName && (s.slug.includes("list-tags") || s.slug.includes("retrieve-tags"))) {
      request = {
        ...request,
        query: enrichQuery(request.query ?? [], {
          q: tagName,
          tag_type: "user",
          page_size: "100",
          page: "1",
        }),
      };
    } else if (s.slug.includes("list-tags") || s.slug.includes("retrieve-tags")) {
      request = {
        ...request,
        query: enrichQuery(request.query ?? [], { page_size: "100", page: "1" }),
      };
    }

    const wiredBody = bodyByOrder.get(s.order);
    const isBulkAdd = s.slug.includes("bulk-add-remove-tags");
    const bulkTemplate = {
      object_type: "indicator",
      object_ids: "{{threat_data_ids}}",
      data: { tag_id: ["{{tag_id}}"] },
    };

    if (isBulkAdd) {
      const body =
        wiredBody &&
        typeof wiredBody === "object" &&
        !Array.isArray(wiredBody) &&
        Object.keys(wiredBody as object).length > 0
          ? wiredBody
          : bulkTemplate;
      request = { ...request, body: JSON.stringify(body, null, 2) };
    } else if (s.slug.includes("create-tag") && tagName) {
      const current = (() => {
        try {
          return JSON.parse(
            typeof wiredBody === "object" && wiredBody !== null && !Array.isArray(wiredBody)
              ? JSON.stringify(wiredBody)
              : (request.body ?? "{}")
          ) as { name?: string; colour_code?: string };
        } catch {
          return {};
        }
      })();
      if (!current.name?.trim() || current.name === "SuperMalware") {
        request = {
          ...request,
          body: JSON.stringify(
            { ...current, name: tagName, colour_code: current.colour_code ?? "#0068FA" },
            null,
            2
          ),
        };
      }
    } else if (wiredBody !== undefined) {
      request = { ...request, body: JSON.stringify(wiredBody, null, 2) };
    }

    const pathOverrides = pathByOrder.get(s.order);
    if (pathOverrides) {
      request = { ...request, pathParams: mergePathParams(request.pathParams, pathOverrides) };
    } else if (isBulkAdd) {
      request = {
        ...request,
        pathParams: mergePathParams(request.pathParams, { action_type: "add_tag" }),
      };
    }

    return { ...s, request };
  });
}

export function buildWorkflowScripts(
  steps: AgentStepResult[],
  baseUrl: string,
  title: string,
  languages: ScriptLanguage[] = ["python", "javascript"],
  productId = "ctix"
): WorkflowScript[] {
  if (!steps || steps.length === 0) return [];
  const plan = inferScriptPlan(steps);
  const scripts: WorkflowScript[] = [];
  for (const lang of languages) {
    if (lang === "python") {
      scripts.push({
        language: "python",
        label: "Python",
        filename: "workflow.py",
        code: buildPython(plan, baseUrl, title, productId),
        notes: plan.notes,
      });
    } else if (lang === "javascript") {
      scripts.push({
        language: "javascript",
        label: "Node.js",
        filename: "workflow.js",
        code: buildJavascript(plan, baseUrl, title, productId),
        notes: plan.notes,
      });
    }
  }
  return scripts;
}
