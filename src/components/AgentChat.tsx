"use client";

import Link from "next/link";
import { useState } from "react";
import { CodeBlock } from "./CodeBlock";
import type { AgentLanguage, AgentResponse } from "@/lib/agent/types";
import type { CodeSnippet } from "@/lib/types";

const EXAMPLES = [
  "Import a STIX 2.1 bundle and verify the indicator appears in threat data",
  "List threat data indicators with pagination",
  "Test API connectivity with ping",
];

const LANGUAGES: { value: AgentLanguage; label: string }[] = [
  { value: "python", label: "Python" },
  { value: "javascript", label: "JavaScript" },
  { value: "curl", label: "cURL" },
  { value: "java", label: "Java" },
  { value: "go", label: "Go" },
];

function snippetForStep(
  code: string,
  language: AgentLanguage,
  request: AgentResponse["steps"][0]["request"] | undefined
): CodeSnippet {
  const langMap: Record<AgentLanguage, { lang: string; label: string; runKind: CodeSnippet["runKind"] }> = {
    python: { lang: "python", label: "Python", runKind: "python" },
    javascript: { lang: "javascript", label: "JavaScript", runKind: "javascript" },
    curl: { lang: "bash", label: "cURL", runKind: "http" },
    java: { lang: "java", label: "Java", runKind: "none" },
    go: { lang: "go", label: "Go", runKind: "none" },
  };
  const meta = langMap[language];
  return {
    lang: meta.lang,
    label: meta.label,
    code,
    runKind: meta.runKind,
    request: meta.runKind === "http" ? request : undefined,
  };
}

export function AgentChat() {
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState<AgentLanguage>("python");
  const [llmKey, setLlmKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AgentResponse | null>(null);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (!q || loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: q,
          language,
          llmApiKey: llmKey.trim() || undefined,
        }),
      });
      const data = (await res.json()) as AgentResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/30">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-semibold">What do you want to do?</span>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            rows={4}
            placeholder="e.g. Import a STIX bundle and list the resulting indicators…"
            className="resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold">Code language</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as AgentLanguage)}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950"
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs">
            <span className="font-semibold">OpenAI API key (optional)</span>
            <input
              type="password"
              value={llmKey}
              onChange={(e) => setLlmKey(e.target.value)}
              placeholder="Uses server key if configured"
              autoComplete="off"
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>

          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
          >
            {loading ? "Searching docs…" : "Plan workflow"}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setQuery(ex)}
              className="rounded-full border border-zinc-300 px-2.5 py-0.5 text-[11px] text-zinc-600 hover:bg-white dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
            >
              {ex.length > 48 ? `${ex.slice(0, 48)}…` : ex}
            </button>
          ))}
        </div>
      </form>

      {error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="space-y-6">
          {result.fallback ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              Low confidence match — review suggestions carefully or refine your question.
            </div>
          ) : null}

          <section>
            <h2 className="mb-2 text-lg font-semibold">Workflow</h2>
            <div className="prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap">
              {result.workflow}
            </div>
          </section>

          {result.questions?.length ? (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-zinc-600 dark:text-zinc-400">
                Clarifying questions
              </h2>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {result.questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {result.citations.length > 0 ? (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-zinc-600 dark:text-zinc-400">
                Documentation references
              </h2>
              <ul className="flex flex-wrap gap-2">
                {result.citations.map((c) => (
                  <li key={c.slug}>
                    <Link
                      href={c.url}
                      className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                    >
                      {c.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {result.steps.map((step) => (
            <section
              key={`${step.order}-${step.slug}`}
              className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div className="mb-2 flex flex-wrap items-baseline gap-2">
                <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-bold dark:bg-zinc-800">
                  Step {step.order}
                </span>
                <h3 className="text-base font-semibold">{step.title}</h3>
                <code className="text-xs text-sky-600 dark:text-sky-400">
                  {step.method} {step.path}
                </code>
                <Link href={step.docUrl} className="text-xs underline text-zinc-500">
                  View docs
                </Link>
              </div>
              <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">{step.explanation}</p>
              {step.warnings.map((w) => (
                <p key={w} className="mb-2 text-xs text-amber-700 dark:text-amber-400">
                  {w}
                </p>
              ))}
              <CodeBlock snippet={snippetForStep(step.code, language, step.request)} />
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
