// Shared, dependency-free security helpers (safe for client + server).

/** Header/param names that should be treated as sensitive. */
const SENSITIVE_NAME =
  /(authorization|api[-_ ]?key|secret|token|signature|password|access[-_ ]?id|expires?|bearer|x-api-key|client[-_ ]?secret)/i;

/** Placeholder patterns commonly used for credentials in docs snippets. */
const PLACEHOLDER = /(<[^>]*>|\{\{[^}]*\}\}|YOUR_[A-Z_]+|enter (access id|secret key)|xxxx+|your-?(token|key|secret))/i;

export function isSensitiveName(name: string): boolean {
  return SENSITIVE_NAME.test(name);
}

export function looksLikePlaceholder(value: string): boolean {
  if (!value) return false;
  return PLACEHOLDER.test(value);
}

/** Mask a secret value for display, keeping a small hint of length. */
export function maskValue(value: string): string {
  if (value == null) return "";
  const s = String(value);
  if (s.length <= 4) return "•".repeat(s.length || 3);
  return s.slice(0, 2) + "•".repeat(Math.min(s.length - 4, 12)) + s.slice(-2);
}

/**
 * Mask sensitive tokens inside an arbitrary text blob (e.g. echoed request
 * logs / output). Masks values of known sensitive query params and headers.
 */
export function maskText(text: string, extraSecrets: string[] = []): string {
  if (!text) return text;
  let out = text;

  // Authorization: Bearer <token>  /  Authorization: <token>
  out = out.replace(
    /("?authorization"?\s*[:=]\s*"?)(bearer\s+)?([^\s",}]+)/gi,
    (_m, p1, bearer = "", val) => `${p1}${bearer}${maskValue(val)}`
  );

  // Sensitive query params: AccessID=..., Signature=..., api_key=...
  out = out.replace(
    /\b(access[-_]?id|signature|api[-_]?key|token|secret|password|x-api-key)\b(\s*[:=]\s*"?)([^\s"&,}]+)/gi,
    (_m, key, sep, val) => `${key}${sep}${maskValue(val)}`
  );

  // Explicit known secret strings supplied by caller.
  for (const secret of extraSecrets) {
    if (secret && secret.length >= 4) {
      out = out.split(secret).join(maskValue(secret));
    }
  }
  return out;
}

export const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isMutating(method: string): boolean {
  return MUTATING_METHODS.has(String(method).toUpperCase());
}
