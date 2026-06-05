import { missingAuthCredentials } from "./resolve-request";
import { looksLikePlaceholder } from "./security";
import type { KeyValue } from "./types";

const AUTH_PARAM_KEYS: { param: string; key: string }[] = [
  { param: "AccessID", key: "accessid" },
  { param: "Signature", key: "signature" },
  { param: "Expires", key: "expires" },
];

/** Doc snippet placeholders → credential key (lowercase). */
export const SNIPPET_PLACEHOLDERS: { pattern: RegExp; key: string; encoded?: boolean }[] = [
  { pattern: /<\s*your\s+access\s+id\s*>/gi, key: "accessid" },
  { pattern: /<\s*enter\s+access\s+id\s*>/gi, key: "accessid" },
  { pattern: /<\s*generated\s+signature\s*>/gi, key: "signature" },
  { pattern: /<\s*unix\s+expiry\s*>/gi, key: "expires" },
  { pattern: /\{\{\s*accessid\s*\}\}/gi, key: "accessid" },
  { pattern: /\{\{\s*signature\s*\}\}/gi, key: "signature" },
  { pattern: /\{\{\s*expires\s*\}\}/gi, key: "expires" },
  // URL-encoded placeholders (JS/cURL snippets use encodeURIComponent in the URL)
  { pattern: /%3Cyour%20access%20id%3E/gi, key: "accessid", encoded: true },
  { pattern: /%3Cgenerated%20signature%3E/gi, key: "signature", encoded: true },
  { pattern: /%3Cunix%20expiry%3E/gi, key: "expires", encoded: true },
];

function credValue(getCred: (name: string) => string, key: string): string {
  for (const { param, key: k } of AUTH_PARAM_KEYS) {
    if (k === key) {
      const v = getCred(param) || getCred(k);
      if (v && !looksLikePlaceholder(v)) return v;
    }
  }
  return "";
}

export function substituteSnippetPlaceholders(
  code: string,
  getCred: (name: string) => string
): string {
  let out = code;
  for (const { pattern, key, encoded } of SNIPPET_PLACEHOLDERS) {
    const value = credValue(getCred, key);
    if (!value) continue;
    out = out.replace(pattern, () =>
      encoded ? encodeURIComponent(value) : key === "expires" ? value : value
    );
  }
  return out;
}

/** Force AccessID, Signature, Expires on a request URL from stored credentials. */
export function injectOpenApiAuthIntoUrl(
  url: string,
  getCred: (name: string) => string
): string {
  try {
    const u = new URL(url);
    for (const { param, key } of AUTH_PARAM_KEYS) {
      const val = credValue(getCred, key);
      if (val) u.searchParams.set(param, val);
    }
    return u.toString();
  } catch {
    return url;
  }
}

export async function ensureOpenApiAuth(
  authFields: { name: string; example: string }[],
  getCred: (name: string) => string,
  generateAuth: () => Promise<void>,
  accessId: string,
  secretKey: string
): Promise<string | null> {
  const pairs: KeyValue[] = authFields.map((f) => ({
    name: f.name,
    value: f.example,
  }));

  let missing = missingAuthCredentials(pairs, getCred);
  const exp = getCred("Expires") || getCred("expires");
  if (!missing.includes("Expires") && exp && !isValidExpiresValue(exp)) {
    missing = [...missing, "Expires"];
  }
  if (missing.length === 0) return null;

  if (accessId.trim() && secretKey.trim()) {
    await generateAuth();
    missing = missingAuthCredentials(pairs, getCred);
    const exp2 = getCred("Expires") || getCred("expires");
    if (!missing.includes("Expires") && exp2 && !isValidExpiresValue(exp2)) {
      missing = [...missing, "Expires"];
    }
    if (missing.length === 0) return null;
  }

  return `Missing or expired auth: ${missing.join(", ")}. Use API Settings → Generate Signature & Expires, then Run within ~20 s.`;
}

export function isValidExpiresValue(value: string): boolean {
  const n = Number(String(value).trim());
  if (!Number.isFinite(n) || n <= 0) return false;
  return n > Math.floor(Date.now() / 1000);
}
