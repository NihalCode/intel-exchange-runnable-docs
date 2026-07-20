/** Pure env string helpers — leaf module (no auth/base-url imports). */

export function cleanEnvValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    const unquoted = trimmed.slice(1, -1).trim();
    return unquoted || null;
  }
  return trimmed;
}

export function normalizeAppBaseUrl(value: string | undefined): string | null {
  const clean = cleanEnvValue(value);
  if (!clean) return null;
  return clean.replace(/\/+$/, "");
}
