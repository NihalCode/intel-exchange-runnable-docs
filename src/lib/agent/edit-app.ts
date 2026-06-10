import "server-only";

import {
  applyRuleBasedEdits,
  applySearchReplace,
  mergeFileUpdates,
  normalizeLlmCode,
} from "./app-edit-rules";
import { formatProblems, validateAppFiles } from "./validate-app";
import type { AgentAppBlueprint } from "./types";

const MODEL = "gpt-4o-mini";

interface LlmEditJson {
  summary?: string;
  workflow?: string;
  /** Targeted edits: search must be an exact snippet from the current file. */
  edits?: { path?: string; search?: string; replace?: string }[];
  /** Brand-new files (full content). */
  newFiles?: { path?: string; code?: string }[];
  /** Legacy full-file format — still accepted if the model uses it. */
  files?: { path?: string; code?: string }[];
}


function inferLanguage(path: string): string {
  if (path.endsWith(".tsx")) return "typescript";
  if (path.endsWith(".ts")) return "typescript";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".md")) return "markdown";
  return "typescript";
}

function describeFile(path: string): string {
  if (path === "app/page.tsx") return "Frontend UI";
  if (path.startsWith("app/api/")) return "API route";
  if (path === "lib/cyware/client.ts") return "Cyware client";
  return path;
}

const STYLING_KEYWORDS = /style|theme|color|dark|light|beautif|design|glassmorphism|ui|ux|layout|spacing|font|css|tailwind|gradient|padding|margin|border|card|button|responsive/i;

function pickFilesForPrompt(
  blueprint: AgentAppBlueprint,
  query: string
): { path: string; code: string }[] {
  const isStylingOnly = STYLING_KEYWORDS.test(query);
  // For pure styling requests only send the frontend files — avoids timing out
  // on large apps when the user asks for a UI redesign.
  const priority = isStylingOnly
    ? ["app/page.tsx", "app/globals.css", "app/layout.tsx"]
    : ["app/page.tsx", "app/globals.css", "app/layout.tsx"];

  const picked: { path: string; code: string }[] = [];

  // Send full file content (input tokens are fast/cheap; truncation would break
  // exact-match search snippets near the end of a file)
  for (const path of priority) {
    const f = blueprint.files.find((x) => x.path === path);
    if (f) picked.push({ path: f.path, code: f.code.slice(0, 32000) });
  }

  if (!isStylingOnly) {
    for (const f of blueprint.files) {
      if (f.path.startsWith("app/api/") && !picked.some((p) => p.path === f.path)) {
        picked.push({ path: f.path, code: f.code.slice(0, 4000) });
      }
    }
  }

  return picked;
}

export async function editAppWithLlm(
  query: string,
  existing: AgentAppBlueprint,
  apiKey: string,
  history?: { role: "user" | "assistant"; content: string }[]
): Promise<{ blueprint: AgentAppBlueprint; summary: string; changedPaths: string[] }> {
  // Rule-based edits first — no API call, always reliable
  const ruleResult = applyRuleBasedEdits(query, existing);
  if (ruleResult) {
    return ruleResult;
  }

  const fileIndex = existing.files.map((f) => f.path).join("\n");
  const promptFiles = pickFilesForPrompt(existing, query);
  const fileContext = promptFiles
    .map((f) => `### ${f.path}\n\`\`\`\n${f.code}\n\`\`\``)
    .join("\n\n");

  const system = `You edit an existing Next.js Cyware integration app using targeted search/replace edits.
Return JSON:
{
  "summary": string,
  "edits": [{ "path": string, "search": string, "replace": string }],
  "newFiles": [{ "path": string, "code": string }]
}

EDIT RULES:
- "search" MUST be an EXACT, contiguous snippet copied from the current file content shown below — including indentation. It must appear exactly once in that file.
- "replace" is the full replacement for that snippet.
- Keep each search snippet as small as possible while staying unique (typically 2-15 lines).
- Use multiple edits for multiple changes — even within the same file.
- Use "newFiles" only for brand-new files (full content, no fences).
- For large restyles, prefer editing app/globals.css (selectors apply across the app) over rewriting JSX.

REQUIREMENTS:
- Return valid TypeScript/TSX/CSS that compiles after your edits are applied.
- Preserve HMAC auth in API routes and lib/cyware/client.ts unless explicitly asked to change auth.
- For IOC extraction logic, edit app/page.tsx function extractIOCs.
- Never put Cyware secrets in client-side code.
- Do not wrap code in markdown fences inside JSON string values.`;

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: system },
  ];
  if (history?.length) {
    for (const h of history.slice(-8)) {
      messages.push({ role: h.role, content: h.content.slice(0, 2000) });
    }
  }
  messages.push({
    role: "user",
    content: `Edit request: ${query}

All project files:
${fileIndex}

Current source of files most likely to change:
${fileContext}`,
  });

  // Abort before Vercel's 60s function limit so the user gets a clear error
  // instead of a platform-killed request ("Internal Server Error").
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 50_000);
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.15,
        max_tokens: 8192,
        response_format: { type: "json_object" },
        messages,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        "The AI service took too long to respond and the edit was cancelled. Please try again."
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`App edit failed (${res.status}): ${err.slice(0, 300)}`);
  }

  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  const raw = data.choices[0]?.message?.content ?? "{}";
  let parsed: LlmEditJson;
  try {
    parsed = JSON.parse(raw) as LlmEditJson;
  } catch {
    throw new Error("LLM returned invalid JSON for app edit");
  }

  const updates = new Map<string, string>();
  const failedEdits: string[] = [];

  // Targeted search/replace edits (fast path — small LLM output)
  for (const e of parsed.edits ?? []) {
    if (!e.path || !e.search || e.replace === undefined) continue;
    const current = updates.get(e.path) ?? existing.files.find((f) => f.path === e.path)?.code;
    if (current === undefined) {
      failedEdits.push(`${e.path}: file not found`);
      continue;
    }
    const next = applySearchReplace(current, normalizeLlmCode(e.search), normalizeLlmCode(e.replace));
    if (next === null) {
      failedEdits.push(`${e.path}: search snippet not found`);
      continue;
    }
    updates.set(e.path, next);
  }

  // Brand-new files
  for (const f of parsed.newFiles ?? []) {
    if (f.path && f.code !== undefined && f.code.trim().length > 0) {
      updates.set(f.path, normalizeLlmCode(f.code));
    }
  }

  // Legacy full-file format (if the model returned it anyway)
  for (const f of parsed.files ?? []) {
    if (f.path && f.code !== undefined && f.code.trim().length > 0) {
      updates.set(f.path, normalizeLlmCode(f.code));
    }
  }

  if (updates.size === 0) {
    const detail = failedEdits.length > 0 ? ` (${failedEdits.slice(0, 3).join("; ")})` : "";
    throw new Error(
      `The AI's edits could not be applied${detail}. Try rephrasing or being more specific about the file, ` +
        'e.g. "In app/page.tsx, style the email textarea with a dark background."'
    );
  }

  // Verify at least one file actually changed
  const changedPaths: string[] = [];
  for (const [path, code] of updates) {
    const prev = existing.files.find((f) => f.path === path)?.code;
    if (prev !== code) changedPaths.push(path);
  }

  if (changedPaths.length === 0) {
    throw new Error("Edit produced identical file content — no changes applied. Rephrase your request.");
  }

  // Reject the edit outright if it would produce files that can't compile —
  // a broken version must never be saved or deployed.
  const editedFiles = changedPaths.map((p) => ({ path: p, code: updates.get(p)! }));
  const problems = validateAppFiles(editedFiles);
  if (problems.length > 0) {
    throw new Error(
      `The AI edit was rejected because it would break the app (${formatProblems(problems)}). ` +
        "Your app is unchanged — try rephrasing the request."
    );
  }

  const merged = mergeFileUpdates(existing, updates);

  let summary = parsed.summary ?? `Updated ${changedPaths.join(", ")}`;
  if (failedEdits.length > 0) {
    summary += ` (note: ${failedEdits.length} edit(s) could not be applied — review the result)`;
  }

  return {
    blueprint: {
      ...merged,
      description: parsed.summary ?? existing.description,
    },
    summary,
    changedPaths,
  };
}

export function attachDiff(
  diff: import("./app-diff").AgentAppDiff,
  fromVersion: number,
  toVersion: number,
  summary: string
) {
  return { ...diff, fromVersion, toVersion, summary };
}
