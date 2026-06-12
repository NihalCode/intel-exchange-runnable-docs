/** Find a tag in list/search responses and format user-facing summaries. */

export interface TagRecord {
  id: string;
  name: string;
  is_active?: boolean;
}

function dig(obj: unknown, key: string): unknown {
  if (obj && typeof obj === "object" && key in (obj as Record<string, unknown>)) {
    return (obj as Record<string, unknown>)[key];
  }
  return undefined;
}

export function tagResultsFromBody(parsed: unknown): unknown[] {
  let items = dig(parsed, "results");
  if (items === undefined && Array.isArray(parsed)) items = parsed;
  return Array.isArray(items) ? items : [];
}

export function findTagByName(items: unknown[], tagName: string): TagRecord | null {
  const want = tagName.trim().toLowerCase();
  if (!want) return null;
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const name = row.name;
    const id = row.id;
    if (typeof name === "string" && name.toLowerCase() === want && typeof id === "string" && id) {
      return {
        id,
        name,
        is_active: typeof row.is_active === "boolean" ? row.is_active : undefined,
      };
    }
  }
  return null;
}

export function summarizeTagLookup(
  parsed: unknown,
  tagName: string
): { found: boolean; tag: TagRecord | null; message: string } {
  const items = tagResultsFromBody(parsed);
  const tag = findTagByName(items, tagName);
  if (tag) {
    const active = tag.is_active === undefined ? "" : ` · is_active: ${tag.is_active}`;
    return {
      found: true,
      tag,
      message: `Tag "${tag.name}" already exists · id: ${tag.id}${active}`,
    };
  }
  if (items.length === 0) {
    return {
      found: false,
      tag: null,
      message: `Tag "${tagName}" was not found — safe to create it.`,
    };
  }
  return {
    found: false,
    tag: null,
    message: `Tag "${tagName}" was not found in ${items.length} result(s) — safe to create it.`,
  };
}

export function summarizeCreateTagResponse(
  parsed: unknown,
  tagName: string,
  ok: boolean
): string | null {
  if (ok && parsed && typeof parsed === "object") {
    const row = parsed as Record<string, unknown>;
    if (typeof row.id === "string" && row.id) {
      const name = typeof row.name === "string" ? row.name : tagName;
      const active = typeof row.is_active === "boolean" ? ` · is_active: ${row.is_active}` : "";
      return `Created tag "${name}" · id: ${row.id}${active}`;
    }
  }
  if (!ok && isDuplicateTagError(parsed)) {
    return (
      `Tag "${tagName}" already exists — create was rejected. ` +
      `Search tags with q=${tagName} to get the existing id, or check the search step above.`
    );
  }
  return null;
}

export function isDuplicateTagError(parsed: unknown): boolean {
  const text = JSON.stringify(parsed ?? "").toLowerCase();
  return (
    /already exist/.test(text) ||
    /duplicate/.test(text) ||
    /unique/.test(text) ||
    /must be unique/.test(text)
  );
}
