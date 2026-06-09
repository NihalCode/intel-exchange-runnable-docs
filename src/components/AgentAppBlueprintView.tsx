"use client";

import { useState } from "react";
import { CodeBlock } from "./CodeBlock";
import type { AgentAppBlueprint } from "@/lib/agent/types";
import type { CodeSnippet } from "@/lib/types";

export function AgentAppBlueprintView({ app }: { app: AgentAppBlueprint }) {
  const [activePath, setActivePath] = useState(app.files[0]?.path ?? "");

  const activeFile = app.files.find((f) => f.path === activePath) ?? app.files[0];

  const snippet: CodeSnippet | null = activeFile
    ? {
        lang: activeFile.language === "typescript" ? "typescript" : activeFile.language,
        label: activeFile.path,
        code: activeFile.code,
        runKind: "none",
      }
    : null;

  return (
    <section className="space-y-4 rounded-xl border border-indigo-300/50 bg-indigo-50/20 p-4 dark:border-indigo-900 dark:bg-indigo-950/20">
      <div>
        <h2 className="text-lg font-semibold text-indigo-950 dark:text-indigo-100">{app.title}</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{app.description}</p>
      </div>

      <div className="rounded-md border border-zinc-200 bg-white/60 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Architecture</h3>
        <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed">{app.architecture}</pre>
      </div>

      <div className="rounded-md border border-amber-300/50 bg-amber-50/50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/20">
        <strong className="text-amber-900 dark:text-amber-200">Setup:</strong>{" "}
        <span className="text-amber-800 dark:text-amber-300">{app.setupInstructions}</span>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <ul className="flex shrink-0 flex-row gap-1 overflow-x-auto lg:w-56 lg:flex-col lg:overflow-visible">
          {app.files.map((f) => (
            <li key={f.path}>
              <button
                type="button"
                onClick={() => setActivePath(f.path)}
                className={`w-full rounded px-2 py-1.5 text-left font-mono text-[11px] ${
                  activePath === f.path
                    ? "bg-indigo-600 text-white"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-900"
                }`}
              >
                {f.path}
              </button>
            </li>
          ))}
        </ul>

        <div className="min-w-0 flex-1">
          {activeFile ? (
            <>
              <p className="mb-2 text-xs text-zinc-600 dark:text-zinc-400">{activeFile.description}</p>
              {snippet ? <CodeBlock snippet={snippet} /> : null}
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
