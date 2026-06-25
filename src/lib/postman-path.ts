import type { KeyValue } from "./types";

const AUTH_PARAM_NAMES = new Set(["AccessID", "Signature", "Expires"]);

/**
 * Normalize Postman-exported URL templates (CFTR) into a runnable path + query.
 * Handles: {{base_url}}v1/foo/:id/?AccessID={{...}}&Expires=...
 */
export function normalizePostmanEndpointPath(raw: string): {
  path: string;
  embeddedQuery: KeyValue[];
  pathParamNames: string[];
} {
  let s = raw.trim();
  const embeddedQuery: KeyValue[] = [];
  const pathParamNames: string[] = [];

  s = s.replace(/^\/?\{\{base_url\}\}?\/?/i, "");

  const qIdx = s.indexOf("?");
  if (qIdx !== -1) {
    const qs = s.slice(qIdx + 1);
    s = s.slice(0, qIdx);
    for (const part of qs.split("&")) {
      const eq = part.indexOf("=");
      const name = (eq === -1 ? part : part.slice(0, eq)).trim();
      const val = eq === -1 ? "" : part.slice(eq + 1).trim();
      if (!name) continue;
      if (AUTH_PARAM_NAMES.has(name)) {
        embeddedQuery.push({ name, value: `<${name.toLowerCase()}>` });
      } else if (val && !/^\{\{/.test(val)) {
        embeddedQuery.push({ name, value: decodeURIComponent(val) });
      }
    }
  }

  s = s.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
    pathParamNames.push(name);
    return `{${name}}`;
  });

  s = s.replace(/\{\{([^}]+)\}\}/g, (_, name) => {
    const n = String(name).trim();
    if (/^(open_api_access_id|access_id|accessid)$/i.test(n)) return "";
    if (/^(expires|signature)$/i.test(n)) return "";
    pathParamNames.push(n);
    return `{${n}}`;
  });

  s = s.replace(/\/+/g, "/");
  if (!s.startsWith("/")) s = `/${s}`;

  return { path: s, embeddedQuery, pathParamNames };
}

export function isPostmanTemplatePath(path: string): boolean {
  return /\{\{base_url\}\}|:\w+|\{\{[^}]+\}\}/.test(path);
}
