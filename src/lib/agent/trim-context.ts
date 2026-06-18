/**
 * Trim retrieved chunk text before sending it to the LLM, so the context
 * window carries only the relevant data:
 *   - signature (title / METHOD path / one-line description)
 *   - required params, plus optional params the user's query actually mentions
 *   - the long descriptions of irrelevant optional params are dropped
 *
 * This typically cuts per-chunk size by 60-80% versus the raw chunk text.
 */
import type { ScoredChunk } from "./types";

const PARAM_SECTION_RE =
  /^(Path parameters|Query parameters|Headers|Body fields):$/i;

/** A "- name (required, type): desc" param line. */
const PARAM_LINE_RE = /^-\s*([A-Za-z0-9_.]+)\s*\(([^)]*)\)/;

function queryKeywords(query: string): Set<string> {
  return new Set(
    query
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, " ")
      .split(/\s+/)
      .filter(Boolean)
  );
}

/** A param is "mentioned" if named exactly, or shares a multi-char substring. */
function isMentioned(name: string, keywords: Set<string>): boolean {
  if (keywords.has(name)) return true;
  for (const k of keywords) {
    if (k.length > 3 && (name.includes(k) || k.includes(name))) return true;
  }
  return false;
}

function trimParamSection(
  header: string,
  lines: string[],
  keywords: Set<string>,
  maxOptional: number
): string[] {
  const kept: string[] = [];
  let optionalShown = 0;
  let droppedOptional = 0;

  for (const line of lines) {
    const m = line.match(PARAM_LINE_RE);
    if (!m) {
      kept.push(line);
      continue;
    }
    const name = m[1].toLowerCase();
    const flags = m[2].toLowerCase();
    const isRequired = flags.includes("required");
    const mentioned = isMentioned(name, keywords);

    if (isRequired || mentioned) {
      kept.push(line);
    } else if (optionalShown < maxOptional) {
      // Keep a short, name-only hint for a few optional params (drop the desc).
      kept.push(`- ${m[1]} (${m[2]})`);
      optionalShown++;
    } else {
      droppedOptional++;
    }
  }

  if (kept.length === 0) return [];
  const result = [`${header}:`, ...kept];
  if (droppedOptional > 0) {
    result.push(`  (+${droppedOptional} more optional param${droppedOptional === 1 ? "" : "s"} — see docs)`);
  }
  return result;
}

/** Trim a single chunk's text to the essentials for the given query. */
export function trimChunkText(
  text: string,
  query: string,
  opts: { maxOptionalPerSection?: number; descMaxLen?: number } = {}
): string {
  const maxOptional = opts.maxOptionalPerSection ?? 2;
  const descMaxLen = opts.descMaxLen ?? 200;
  const keywords = queryKeywords(query);

  const sections = text.split("\n\n");
  const out: string[] = [];

  for (const section of sections) {
    const lines = section.split("\n");
    const headerMatch = lines[0]?.match(PARAM_SECTION_RE);
    if (headerMatch) {
      const header = headerMatch[1];
      const trimmed = trimParamSection(header, lines.slice(1), keywords, maxOptional);
      if (trimmed.length > 0) out.push(trimmed.join("\n"));
    } else {
      // Non-param section (title, breadcrumb, signature, description): keep but
      // cap long prose so a giant description does not dominate the window.
      out.push(section.length > descMaxLen ? `${section.slice(0, descMaxLen)}…` : section);
    }
  }

  return out.join("\n\n");
}

/** Format trimmed chunks into a compact prompt context block. */
export function formatTrimmedContext(
  chunks: ScoredChunk[],
  query: string,
  limit = 8
): string {
  return chunks
    .slice(0, limit)
    .map((c, i) => {
      const head = `[${i + 1}] slug=${c.slug} kind=${c.kind}${c.method ? ` method=${c.method}` : ""}${c.path ? ` path=${c.path}` : ""}`;
      return `${head}\n${trimChunkText(c.text, query)}`;
    })
    .join("\n\n---\n\n");
}
