"use client";

import { useState } from "react";
import type { WorkflowScript } from "@/lib/agent/types";

export function AgentWorkflowScript({ scripts }: { scripts: WorkflowScript[] }) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);

  if (!scripts || scripts.length === 0) return null;
  const script = scripts[Math.min(active, scripts.length - 1)];

  async function copy() {
    try {
      await navigator.clipboard.writeText(script.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <section className="rounded-xl border border-emerald-300/50 bg-emerald-50/30 dark:border-emerald-900 dark:bg-emerald-950/20">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200/60 px-4 py-2.5 dark:border-emerald-900">
        <div>
          <h3 className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
            Complete workflow script
          </h3>
          <p className="text-[11px] text-emerald-700/80 dark:text-emerald-300/70">
            One runnable file — auth, retries &amp; rate-limit backoff, error handling, and step
            chaining built in.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {scripts.map((s, i) => (
            <button
              key={s.language}
              type="button"
              onClick={() => setActive(i)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                i === active
                  ? "bg-emerald-600 text-white"
                  : "text-emerald-800 hover:bg-emerald-100 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
              }`}
            >
              {s.label}
            </button>
          ))}
          <button
            type="button"
            onClick={copy}
            className="rounded-md border border-emerald-300 px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {script.notes.length > 0 ? (
        <div className="border-b border-emerald-200/50 px-4 py-2 dark:border-emerald-900/60">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            Chaining applied
          </p>
          <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-emerald-800/90 dark:text-emerald-300/80">
            {script.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex items-center justify-between px-4 pt-2 text-[11px] text-emerald-700/70 dark:text-emerald-400/70">
        <code className="font-mono">{script.filename}</code>
        <span>
          Set <code className="font-mono">CTIX_ACCESS_ID</code> &amp;{" "}
          <code className="font-mono">CTIX_SECRET_KEY</code> before running
        </span>
      </div>
      <pre className="max-h-[28rem] overflow-auto px-4 pb-4 pt-2 text-[11px] leading-relaxed">
        <code className="font-mono">{script.code}</code>
      </pre>
    </section>
  );
}
