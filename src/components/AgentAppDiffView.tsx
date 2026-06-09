"use client";

import { useState } from "react";
import { CodeBlock } from "./CodeBlock";
import type { AgentAppDiff } from "@/lib/agent/types";
import type { CodeSnippet } from "@/lib/types";

export function AgentAppDiffView({ diff }: { diff: AgentAppDiff }) {
  const [activePath, setActivePath] = useState(diff.files[0]?.path ?? "");
  const active = diff.files.find((f) => f.path === activePath) ?? diff.files[0];

  const snippet: CodeSnippet | null = active
    ? {
        lang: "bash",
        label: active.path,
        code: active.preview,
        runKind: "none",
      }
    : null;

  if (diff.files.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/40">
        No file changes detected.
      </div>
    );
  }

  return (
    <section className="space-y-3 rounded-xl border border-violet-300/50 bg-violet-50/20 p-4 dark:border-violet-900 dark:bg-violet-950/20">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-violet-950 dark:text-violet-100">
            Changes v{diff.fromVersion} → v{diff.toVersion}
          </h3>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">{diff.summary}</p>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold">
          {diff.stats.modified > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              {diff.stats.modified} modified
            </span>
          )}
          {diff.stats.added > 0 && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
              {diff.stats.added} added
            </span>
          )}
          {diff.stats.removed > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-800 dark:bg-red-950 dark:text-red-200">
              {diff.stats.removed} removed
            </span>
          )}
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            {diff.stats.unchanged} unchanged
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        <ul className="flex shrink-0 flex-row gap-1 overflow-x-auto lg:w-48 lg:flex-col lg:overflow-visible">
          {diff.files.map((f) => (
            <li key={f.path}>
              <button
                type="button"
                onClick={() => setActivePath(f.path)}
                className={`w-full rounded px-2 py-1.5 text-left font-mono text-[10px] ${
                  activePath === f.path
                    ? "bg-violet-600 text-white"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
                }`}
              >
                <span
                  className={
                    f.status === "added"
                      ? "text-emerald-600"
                      : f.status === "removed"
                        ? "text-red-600"
                        : "text-amber-600"
                  }
                >
                  {f.status === "added" ? "+" : f.status === "removed" ? "−" : "~"}
                </span>{" "}
                {f.path.split("/").pop()}
              </button>
            </li>
          ))}
        </ul>
        <div className="min-w-0 flex-1">
          {active && snippet ? (
            <>
              <p className="mb-1 font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                {active.path}{" "}
                <span className="text-zinc-400">
                  (+{active.additions} / −{active.deletions})
                </span>
              </p>
              <CodeBlock snippet={snippet} />
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
