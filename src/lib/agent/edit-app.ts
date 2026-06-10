import "server-only";

import { applyRuleBasedEdits, mergeFileUpdates, normalizeLlmCode } from "./app-edit-rules";
import type { AgentAppBlueprint } from "./types";

const MODEL = "gpt-4o-mini";

interface LlmEditJson {
  summary?: string;
  workflow?: string;
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

  for (const path of priority) {
    const f = blueprint.files.find((x) => x.path === path);
    if (f) picked.push({ path: f.path, code: f.code.slice(0, 12000) });
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

  const system = `You edit an existing Next.js Cyware integration app.
Return JSON: { "summary": string, "files": [{ "path": string, "code": string }] }

REQUIREMENTS:
- You MUST include at least one file in "files" with the COMPLETE updated file content (not a diff snippet).
- Only include files you actually changed.
- Return valid TypeScript/TSX that compiles.
- Preserve HMAC auth in API routes and lib/cyware/client.ts unless explicitly asked to change auth.
- For IOC extraction logic, edit app/page.tsx function extractIOCs.
- Never put Cyware secrets in client-side code.
- Do not wrap code in markdown fences inside the JSON string values.`;

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

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
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
  });

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
  for (const f of parsed.files ?? []) {
    if (f.path && f.code !== undefined && f.code.trim().length > 0) {
      updates.set(f.path, normalizeLlmCode(f.code));
    }
  }

  if (updates.size === 0) {
    throw new Error(
      "The AI did not return any file changes. Try a more specific request, e.g. " +
        '"Update extractIOCs in app/page.tsx to skip recipient email domains."'
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

  const merged = mergeFileUpdates(existing, updates);

  return {
    blueprint: {
      ...merged,
      description: parsed.summary ?? existing.description,
    },
    summary: parsed.summary ?? `Updated ${changedPaths.join(", ")}`,
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
