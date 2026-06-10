import type { AgentAppBlueprint } from "./types";

export interface EditResult {
  blueprint: AgentAppBlueprint;
  summary: string;
  changedPaths: string[];
}

/** Improved extractIOCs — skips domains that only appear as email hostnames (recipient false positives). */
const EXTRACT_IOCS_PATCH = `function extractIOCs(text: string): IOC[] {
  const seen = new Set<string>();
  const iocs: IOC[] = [];
  const emailDomains = new Set<string>();

  function add(value: string, type: IocType) {
    const key = type + ":" + value.toLowerCase();
    if (!seen.has(key)) { seen.add(key); iocs.push({ type, value }); }
  }

  // Collect email domains first (used to filter false-positive domain IOCs)
  for (const m of text.matchAll(/\\b[a-z0-9._%+\\-]+@([a-z0-9.\\-]+\\.[a-z]{2,})\\b/gi)) {
    emailDomains.add(m[1].toLowerCase());
  }

  // URLs first
  for (const m of text.matchAll(/https?:\\/\\/[^\\s<>"'\\]\\[()]+/gi)) add(m[0], "url");

  // IPv4 (skip private ranges)
  for (const m of text.matchAll(/\\b(?:(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.){3}(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\b/g)) {
    const parts = m[0].split(".").map(Number);
    const isPrivate =
      parts[0] === 10 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      parts[0] === 127;
    if (!isPrivate) add(m[0], "ipv4");
  }

  // Domains — skip if only seen as an email hostname (recipient org false positive)
  for (const m of text.matchAll(/\\b(?:[a-z0-9](?:[a-z0-9\\-]{0,61}[a-z0-9])?\\.)+(?:com|net|org|io|co|info|biz|edu|gov|mil|[a-z]{2})\\b/gi)) {
    const domain = m[0].toLowerCase();
    if (iocs.find((i) => i.type === "url" && i.value.includes(domain))) continue;
    if (emailDomains.has(domain)) continue;
    add(domain, "domain");
  }

  // Emails
  for (const m of text.matchAll(/\\b[a-z0-9._%+\\-]+@[a-z0-9.\\-]+\\.[a-z]{2,}\\b/gi)) add(m[0].toLowerCase(), "email");

  // Hashes
  for (const m of text.matchAll(/\\b[a-f0-9]{64}\\b/gi)) add(m[0].toLowerCase(), "sha256");
  for (const m of text.matchAll(/\\b[a-f0-9]{40}\\b/gi)) add(m[0].toLowerCase(), "sha1");
  for (const m of text.matchAll(/\\b[a-f0-9]{32}\\b/gi)) add(m[0].toLowerCase(), "md5");

  return iocs;
}`;

function patchFile(
  blueprint: AgentAppBlueprint,
  path: string,
  transform: (code: string) => string | null
): EditResult | null {
  const file = blueprint.files.find((f) => f.path === path);
  if (!file) return null;
  const next = transform(file.code);
  if (next === null || next === file.code) return null;
  return {
    blueprint: {
      ...blueprint,
      files: blueprint.files.map((f) => (f.path === path ? { ...f, code: next } : f)),
    },
    summary: `Updated ${path}`,
    changedPaths: [path],
  };
}

function replaceExtractIocs(code: string): string | null {
  if (code.includes("emailDomains")) return null; // already patched
  const match = code.match(/function extractIOCs\([\s\S]*?\n\}/);
  if (!match) return null;
  return code.replace(match[0], EXTRACT_IOCS_PATCH);
}

function patchDarkMode(code: string): string | null {
  if (code.includes("/* agent:dark-mode */")) return null;
  return (
    code +
    `

/* agent:dark-mode */
@media (prefers-color-scheme: dark) {
  body { background: #0f172a; color: #e2e8f0; }
  .card { background: #1e293b; border-color: #334155; }
  textarea, input[type="text"] { background: #0f172a; border-color: #475569; color: #e2e8f0; }
  th { background: #1e293b; color: #94a3b8; }
  td { border-color: #334155; }
  tbody tr:hover td { background: #1e293b; }
}
`
  );
}

const RULES: {
  test: (q: string) => boolean;
  apply: (blueprint: AgentAppBlueprint) => EditResult | null;
  summary: string;
}[] = [
  {
    test: (q) =>
      /recipient|email address|user@|false positive|company\.org|skip.*domain|domain.*email|email.*domain/i.test(
        q
      ),
    summary: "Skip domains that only appear in recipient email addresses",
    apply: (bp) => patchFile(bp, "app/page.tsx", replaceExtractIocs),
  },
  {
    test: (q) => /dark mode|dark theme|dark ui|night mode/i.test(q),
    summary: "Add dark mode styles",
    apply: (bp) => patchFile(bp, "app/globals.css", patchDarkMode),
  },
];

/**
 * Apply deterministic edits without LLM — reliable for common refinement requests.
 */
export function applyRuleBasedEdits(
  query: string,
  blueprint: AgentAppBlueprint
): EditResult | null {
  for (const rule of RULES) {
    if (!rule.test(query)) continue;
    const result = rule.apply(blueprint);
    if (result) {
      return { ...result, summary: rule.summary };
    }
  }
  return null;
}

export function mergeFileUpdates(
  existing: AgentAppBlueprint,
  updates: Map<string, string>
): AgentAppBlueprint {
  const knownPaths = new Set(existing.files.map((f) => f.path));
  const mergedFiles = existing.files.map((f) => {
    const updated = updates.get(f.path);
    return updated !== undefined ? { ...f, code: updated } : f;
  });
  for (const [path, code] of updates) {
    if (!knownPaths.has(path)) {
      mergedFiles.push({
        path,
        code,
        language: path.endsWith(".css") ? "css" : "typescript",
        description: path,
      });
    }
  }
  return { ...existing, files: mergedFiles };
}

/**
 * Apply a search/replace edit. Falls back to whitespace-tolerant line matching
 * when the exact string isn't found (models often mangle indentation).
 */
export function applySearchReplace(
  code: string,
  search: string,
  replace: string
): string | null {
  if (search.length === 0) return null;
  if (code.includes(search)) {
    return code.replace(search, replace);
  }

  // Whitespace-tolerant fallback: match a window of lines comparing trimmed content
  const codeLines = code.split("\n");
  const searchLines = search
    .split("\n")
    .map((l) => l.trim())
    .filter((l, i, arr) => !(l === "" && (i === 0 || i === arr.length - 1)));
  if (searchLines.length === 0) return null;

  for (let i = 0; i <= codeLines.length - searchLines.length; i++) {
    let match = true;
    for (let j = 0; j < searchLines.length; j++) {
      if (codeLines[i + j].trim() !== searchLines[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      const next = [
        ...codeLines.slice(0, i),
        ...replace.split("\n"),
        ...codeLines.slice(i + searchLines.length),
      ];
      return next.join("\n");
    }
  }

  return null;
}

/** Strip markdown code fences LLMs sometimes wrap around file content. */
export function normalizeLlmCode(raw: string): string {
  let code = raw.trim();
  const fence = code.match(/^```(?:\w+)?\n([\s\S]*?)\n```$/);
  if (fence) code = fence[1];
  return code;
}
