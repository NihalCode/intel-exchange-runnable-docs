import type { ResolvedHostContext } from "@/lib/domains/types";

/** Internal request headers set by proxy — never trust from browser. */
export const HOST_CONTEXT_HEADER = "x-iedocs-host-context";

export function serializeHostContext(context: ResolvedHostContext): string {
  return Buffer.from(JSON.stringify(context), "utf8").toString("base64url");
}

export function parseHostContextHeader(value: string | null): ResolvedHostContext | null {
  if (!value?.trim()) return null;
  try {
    const json = Buffer.from(value, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as ResolvedHostContext;
    if (!parsed?.hostname || !parsed.domainKind) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function hostContextRequestHeaders(context: ResolvedHostContext): Record<string, string> {
  return { [HOST_CONTEXT_HEADER]: serializeHostContext(context) };
}
