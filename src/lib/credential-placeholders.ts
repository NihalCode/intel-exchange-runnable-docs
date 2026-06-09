import { looksLikePlaceholder } from "./security";

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
  _authFields: { name: string; example: string }[],
  getCred: (name: string) => string,
  ensureFreshAuth: () => Promise<string | null>
): Promise<string | null> {
  if (isOpenApiAuthFresh(getCred)) return null;
  return ensureFreshAuth();
}

export function isValidExpiresValue(value: string): boolean {
  const n = Number(String(value).trim());
  if (!Number.isFinite(n) || n <= 0) return false;
  return n > Math.floor(Date.now() / 1000);
}

export function isOpenApiAuthParam(name: string): boolean {
  const k = name.toLowerCase();
  return k === "accessid" || k === "signature" || k === "expires";
}

/** True when AccessID, Signature, and Expires are present and Expires is still in the future. */
export function isOpenApiAuthFresh(getCred: (name: string) => string): boolean {
  const accessId = getCred("AccessID") || getCred("accessid");
  const signature = getCred("Signature") || getCred("signature");
  const expires = getCred("Expires") || getCred("expires");
  if (!accessId || looksLikePlaceholder(accessId)) return false;
  if (!signature || looksLikePlaceholder(signature)) return false;
  if (!expires || !isValidExpiresValue(expires)) return false;
  return true;
}
