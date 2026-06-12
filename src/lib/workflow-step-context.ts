/** Session-scoped captures from agent workflow step runs (ids for chaining). */

import { findTagByName, tagResultsFromBody } from "./tag-lookup";

const STORAGE_PREFIX = "cyware-workflow-ctx:";

export type WorkflowContext = Record<string, unknown>;

function storageAvailable(): boolean {
  return typeof sessionStorage !== "undefined";
}

function key(workflowId: string): string {
  return STORAGE_PREFIX + workflowId;
}

export function loadWorkflowContext(workflowId: string): WorkflowContext {
  if (!workflowId || !storageAvailable()) return {};
  try {
    const raw = sessionStorage.getItem(key(workflowId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as WorkflowContext;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveWorkflowContext(workflowId: string, ctx: WorkflowContext) {
  if (!workflowId || !storageAvailable()) return;
  try {
    sessionStorage.setItem(key(workflowId), JSON.stringify(ctx));
  } catch {
    /* quota */
  }
}

export function dig(obj: unknown, dotted: string): unknown {
  let cur: unknown = obj;
  for (const part of dotted.split(".")) {
    if (Array.isArray(cur)) {
      const idx = Number(part);
      cur = Number.isInteger(idx) ? cur[idx] : undefined;
    } else if (cur && typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
    if (cur === undefined) return undefined;
  }
  return cur;
}

function collectionFromSlug(slug: string): string {
  const first = slug.split("/").find(Boolean);
  return first ?? "resource";
}

function singular(word: string): string {
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.endsWith("ses")) return word.slice(0, -2);
  if (word.endsWith("s") && word.length > 3) return word.slice(0, -1);
  return word;
}

function listIdsToken(collection: string): string {
  return `${singular(collection).replace(/[^a-z0-9]+/gi, "_")}_ids`;
}

function idToken(collection: string): string {
  return `${singular(collection).replace(/[^a-z0-9]+/gi, "_")}_id`;
}

function isListSlug(slug: string, method: string): boolean {
  return method === "GET" && /\b(list|search|get|retrieve)\b/i.test(slug);
}

function isCreateSlug(slug: string, method: string): boolean {
  return method === "POST" && /\b(create|add)\b/i.test(slug);
}

/** Store ids / full response after a successful workflow step run. */
export function captureStepOutput(
  workflowId: string,
  stepOrder: number,
  slug: string,
  method: string,
  parsedBody: unknown
) {
  if (!workflowId) return;
  const ctx = loadWorkflowContext(workflowId);
  ctx[`step${stepOrder}`] = parsedBody;

  const collection = collectionFromSlug(slug);

  if (isListSlug(slug, method)) {
    let items = dig(parsedBody, "results");
    if (items === undefined && Array.isArray(parsedBody)) items = parsedBody;
    if (Array.isArray(items)) {
      const ids = items
        .filter((i) => i && typeof i === "object")
        .map((i) => (i as Record<string, unknown>).id)
        .filter((id) => typeof id === "string" && id);
      ctx[listIdsToken(collection)] = ids;
    }
  }

  if (isCreateSlug(slug, method) && parsedBody && typeof parsedBody === "object") {
    const id = (parsedBody as Record<string, unknown>).id;
    if (typeof id === "string" && id) ctx[idToken(collection)] = id;
  }

  if (slug.includes("tags") && method === "GET") {
    const items = tagResultsFromBody(parsedBody);
    const tagName = ctx._tagName;
    if (typeof tagName === "string" && tagName) {
      const match = findTagByName(items, tagName);
      if (match) ctx.tag_id = match.id;
    } else if (items.length === 1) {
      const id = (items[0] as Record<string, unknown>)?.id;
      if (typeof id === "string") ctx.tag_id = id;
    }
  }

  saveWorkflowContext(workflowId, ctx);
}

const TOKEN_RE = /^\{\{(.+?)\}\}$/;

function resolveScalar(token: string, ctx: WorkflowContext): unknown {
  return dig(ctx, token.trim());
}

function resolveValue(value: unknown, ctx: WorkflowContext): unknown {
  if (Array.isArray(value)) return value.map((v) => resolveValue(v, ctx));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = resolveValue(v, ctx);
    }
    return out;
  }
  if (typeof value === "string") {
    const m = value.trim().match(TOKEN_RE);
    if (m) return resolveScalar(m[1], ctx);
    return value.replace(/\{\{(.+?)\}\}/g, (_, t: string) => {
      const v = resolveScalar(t, ctx);
      return v === undefined || v === null ? "" : String(v);
    });
  }
  return value;
}

/** Replace {{token}} placeholders in JSON body text using prior step captures. */
export function resolveWorkflowBodyText(bodyText: string, workflowId: string): string {
  if (!bodyText.trim() || !workflowId) return bodyText;
  const ctx = loadWorkflowContext(workflowId);
  try {
    const parsed = JSON.parse(bodyText);
    return JSON.stringify(resolveValue(parsed, ctx), null, 2);
  } catch {
    return bodyText;
  }
}

/** Return null if ok, or an error message when required tokens are missing. */
export function validateWorkflowTokens(bodyText: string, workflowId: string): string | null {
  if (!bodyText.trim() || !workflowId) return null;
  if (!bodyText.includes("{{")) return null;
  const ctx = loadWorkflowContext(workflowId);
  const missing: string[] = [];
  for (const m of bodyText.matchAll(/\{\{([^}]+)\}\}/g)) {
    const token = m[1].trim();
    if (dig(ctx, token) === undefined && !missing.includes(token)) missing.push(token);
  }
  if (missing.length === 0) return null;
  return `Run earlier steps first — missing captured value(s): ${missing.join(", ")}. Each prior step stores ids automatically after a successful Run.`;
}

export function setWorkflowTagName(workflowId: string, tagName: string) {
  if (!workflowId || !tagName) return;
  const ctx = loadWorkflowContext(workflowId);
  ctx._tagName = tagName;
  saveWorkflowContext(workflowId, ctx);
}

export function extractTagNameFromQuery(query: string): string | undefined {
  const patterns = [
    /\btag(?:s)?\s+["']([^"']+)["']/i,
    /["']([^"']+)["']\s+tag/i,
    /\bconfirm\s+tag\s+["']?([A-Za-z0-9_-]+)/i,
    /\bfind\s+tag\s+["']?([A-Za-z0-9_-]+)/i,
    /\bfind(?:\s+or\s+create)?\s+tag\s+["']?([A-Za-z0-9_-]+)/i,
    /\b(?:named|called)\s+["']?([A-Za-z0-9_-]+)/i,
  ];
  for (const re of patterns) {
    const m = query.match(re);
    if (m?.[1]) return m[1].replace(/[.,]$/, "");
  }
  return undefined;
}
