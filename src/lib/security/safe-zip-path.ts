/** Reject zip-slip / absolute paths in generated archive entries. */
export function safeZipEntryPath(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.includes("\0")) return null;
  if (trimmed.startsWith("/") || trimmed.startsWith("\\")) return null;
  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) return null;
  const normalized = trimmed.replace(/\\/g, "/");
  if (normalized.split("/").some((part) => part === ".." || part === "")) return null;
  if (normalized.length > 240) return null;
  return normalized;
}
