// Dependency-free parsing of curl / raw-HTTP snippets and language detection.
// Pure functions — safe on client and server.

import type { KeyValue } from "./types";
import type { MultipartPart } from "./multipart";

export interface ExecRequest {
  method: string;
  url: string;
  headers: KeyValue[];
  body?: string;
  multipartParts?: MultipartPart[];
}

export type RunKind = "http" | "json" | "javascript" | "python" | "none";

/** Tokenize a shell command respecting single/double quotes and line breaks. */
function shellTokenize(input: string): string[] {
  const cleaned = input.replace(/\\\r?\n/g, " ");
  const tokens: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  let has = false;
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      has = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (has) {
        tokens.push(cur);
        cur = "";
        has = false;
      }
      continue;
    }
    cur += ch;
    has = true;
  }
  if (has) tokens.push(cur);
  return tokens;
}

function splitHeader(raw: string): KeyValue | null {
  const idx = raw.indexOf(":");
  if (idx === -1) return null;
  return { name: raw.slice(0, idx).trim(), value: raw.slice(idx + 1).trim() };
}

export function parseCurl(code: string): ExecRequest | null {
  if (!/\bcurl\b/.test(code)) return null;
  const tokens = shellTokenize(code);
  const start = tokens.findIndex((t) => t === "curl" || t.endsWith("/curl"));
  if (start === -1) return null;

  let method = "";
  let url = "";
  const headers: KeyValue[] = [];
  let body: string | undefined;

  for (let i = start + 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "-X" || t === "--request") {
      method = (tokens[++i] || "").toUpperCase();
    } else if (t === "-H" || t === "--header") {
      const h = splitHeader(tokens[++i] || "");
      if (h) headers.push(h);
    } else if (
      t === "-d" ||
      t === "--data" ||
      t === "--data-raw" ||
      t === "--data-binary" ||
      t === "--data-ascii"
    ) {
      body = tokens[++i] ?? "";
    } else if (t === "--url") {
      url = tokens[++i] || "";
    } else if (t === "-u" || t === "--user") {
      const creds = tokens[++i] || "";
      if (typeof btoa !== "undefined") {
        headers.push({ name: "Authorization", value: `Basic ${btoa(creds)}` });
      }
    } else if (t === "-b" || t === "--cookie") {
      headers.push({ name: "Cookie", value: tokens[++i] || "" });
    } else if (!t.startsWith("-") && !url) {
      url = t;
    }
  }

  if (!url) return null;
  if (!method) method = body ? "POST" : "GET";
  return { method, url, headers, body };
}

export function parseHttp(code: string): ExecRequest | null {
  const lines = code.replace(/\r\n/g, "\n").split("\n");
  const first = (lines[0] || "").trim();
  const m = first.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\S+)/i);
  if (!m) return null;
  const method = m[1].toUpperCase();
  let url = m[2];
  const headers: KeyValue[] = [];
  let i = 1;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      break;
    }
    const h = splitHeader(line);
    if (h && h.name) headers.push(h);
  }
  const body = lines.slice(i).join("\n").trim() || undefined;

  // If the request line used an absolute path, try to find a Host header.
  if (url.startsWith("/")) {
    const host = headers.find((h) => h.name.toLowerCase() === "host");
    if (host) url = `https://${host.value}${url}`;
  }
  return { method, url, headers, body };
}

export function isValidJson(code: string): boolean {
  const t = code.trim();
  if (!(t.startsWith("{") || t.startsWith("["))) return false;
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}

/** Best-effort language detection given an optional fenced-language hint. */
export function detectLanguage(code: string, hint?: string): string {
  const h = (hint || "").toLowerCase();
  const t = code.trim();

  if (["json"].includes(h) || isValidJson(t)) return "json";
  if (["bash", "sh", "shell", "curl", "zsh"].includes(h) || /\bcurl\b/.test(t))
    return "bash";
  if (["python", "py"].includes(h)) return "python";
  if (["javascript", "js", "ts", "typescript", "node"].includes(h))
    return "javascript";
  if (["http"].includes(h)) return "http";

  if (/^(GET|POST|PUT|PATCH|DELETE)\s+\S+/i.test(t)) return "http";
  if (/\b(import|def|print|elif|self)\b/.test(t) && /:\s*$/m.test(t))
    return "python";
  if (/(const|let|var|=>|console\.|fetch\(|async\s+function)/.test(t))
    return "javascript";
  return h || "text";
}

/** Postman pre-request scripts use `pm.*` and only run inside Postman. */
export function isPostmanPreRequestScript(code: string): boolean {
  return /\bpm\.(environment|request|variables|globals|collection|info)\b/.test(code);
}

export function classifyRunKind(lang: string, code: string): RunKind {
  const l = lang.toLowerCase();
  if (l === "json") return "json";
  if (l === "http") return "http";
  if (l === "bash" || l === "sh" || l === "shell" || l === "curl") {
    return /\bcurl\b/.test(code) ? "http" : "none";
  }
  if (l === "javascript" || l === "js" || l === "typescript" || l === "ts") {
    return isPostmanPreRequestScript(code) ? "none" : "javascript";
  }
  if (l === "python" || l === "py") return "python";
  return "none";
}

/** Parse any runnable HTTP snippet (curl first, then raw HTTP). */
export function parseHttpSnippet(code: string): ExecRequest | null {
  return parseCurl(code) || parseHttp(code);
}
