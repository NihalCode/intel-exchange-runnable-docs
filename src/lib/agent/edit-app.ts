import "server-only";

import type { AgentAppBlueprint, AppBlueprintFile } from "./types";
import { diffAppFiles } from "./app-diff";

const MODEL = "gpt-4o-mini";

interface LlmEditJson {
  summary?: string;
  workflow?: string;
  files?: { path?: string; code?: string }[];
}

const EDITABLE_PATHS = new Set([
  "app/page.tsx",
  "app/globals.css",
  "app/layout.tsx",
  "README.md",
  "lib/cyware/client.ts",
]);

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

export async function editAppWithLlm(
  query: string,
  existing: AgentAppBlueprint,
  apiKey: string,
  history?: { role: "user" | "assistant"; content: string }[]
): Promise<{ blueprint: AgentAppBlueprint; summary: string; changedPaths: string[] }> {
  const fileIndex = existing.files.map((f) => f.path).join("\n");
  const keyFiles = existing.files
    .filter((f) => EDITABLE_PATHS.has(f.path) || f.path.startsWith("app/api/"))
    .map((f) => `### ${f.path}\n\`\`\`\n${f.code.slice(0, 12000)}\n\`\`\``)
    .join("\n\n");

  const system = `You edit an existing Next.js Cyware integration app.
Return JSON: { "summary": string, "workflow": string, "files": [{ "path": string, "code": string }] }
Only include files you changed. Preserve HMAC auth patterns and server-only API routes.
Do not remove package.json or env.example unless explicitly asked.
For IOC extraction changes, edit app/page.tsx extractIOCs logic.
Never expose Cyware secrets in client code.`;

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: system },
  ];
  if (history?.length) {
    for (const h of history.slice(-6)) {
      messages.push({ role: h.role, content: h.content });
    }
  }
  messages.push({
    role: "user",
    content: `Edit request: ${query}

All project files:
${fileIndex}

Current source (key files):
${keyFiles}`,
  });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
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
    if (f.path && f.code !== undefined) updates.set(f.path, f.code);
  }

  const knownPaths = new Set(existing.files.map((f) => f.path));
  const mergedFiles: AppBlueprintFile[] = existing.files.map((f) => {
    const updated = updates.get(f.path);
    if (updated === undefined) return f;
    return { ...f, code: updated };
  });

  for (const [path, code] of updates) {
    if (!knownPaths.has(path)) {
      mergedFiles.push({
        path,
        code,
        language: inferLanguage(path),
        description: describeFile(path),
      });
    }
  }

  const changedPaths = [...updates.keys()];

  return {
    blueprint: {
      ...existing,
      description: parsed.summary ?? existing.description,
      files: mergedFiles,
    },
    summary: parsed.summary ?? `Updated ${changedPaths.join(", ") || "app"}`,
    changedPaths,
  };
}

export function attachDiff(
  diff: ReturnType<typeof diffAppFiles>,
  fromVersion: number,
  toVersion: number,
  summary: string
) {
  return { ...diff, fromVersion, toVersion, summary };
}
