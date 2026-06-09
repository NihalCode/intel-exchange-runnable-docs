"use client";

import { useState } from "react";
import { AgentAppBlueprintView } from "./AgentAppBlueprintView";
import { AgentWorkflowStep } from "./AgentWorkflowStep";
import type { AgentLanguage, AgentMode, AgentResponse } from "@/lib/agent/types";

const WORKFLOW_EXAMPLES = [
  "Import a STIX 2.1 bundle and verify the indicator appears in threat data",
  "List threat data indicators with pagination",
  "Test API connectivity with ping",
];

const APP_EXAMPLES = [
  "Build a phishing email analyzer website that extracts IOCs and checks them in Cyware",
  "Build a STIX import portal with a dashboard",
];

const LANGUAGES: { value: AgentLanguage; label: string }[] = [
  { value: "python", label: "Python" },
  { value: "javascript", label: "JavaScript" },
  { value: "curl", label: "cURL" },
  { value: "java", label: "Java" },
  { value: "go", label: "Go" },
];

export function AgentChat() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<AgentMode>("workflow");
  const [language, setLanguage] = useState<AgentLanguage>("python");
  const [llmKey, setLlmKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AgentResponse | null>(null);

  const examples = mode === "app" ? APP_EXAMPLES : WORKFLOW_EXAMPLES;

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
          mode,
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
      <form
        onSubmit={submit}
        className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/30"
      >
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode("workflow")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              mode === "workflow"
                ? "bg-sky-600 text-white"
                : "border border-zinc-300 dark:border-zinc-700"
            }`}
          >
            Run workflow
          </button>
          <button
            type="button"
            onClick={() => setMode("app")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              mode === "app"
                ? "bg-indigo-600 text-white"
                : "border border-zinc-300 dark:border-zinc-700"
            }`}
          >
            Build app
          </button>
        </div>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-semibold">
            {mode === "app"
              ? "Describe the app you want to build"
              : "What task do you want to accomplish?"}
          </span>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            rows={4}
            placeholder={
              mode === "app"
                ? "e.g. Build a phishing analyzer that extracts IOCs, checks Cyware, and shows a dashboard…"
                : "e.g. Import a STIX bundle and list the resulting indicators…"
            }
            className="resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold">Snippet language</span>
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
            {loading
              ? "Analyzing docs…"
              : mode === "app"
                ? "Generate app blueprint"
                : "Plan workflow"}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {examples.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setQuery(ex)}
              className="rounded-full border border-zinc-300 px-2.5 py-0.5 text-[11px] text-zinc-600 hover:bg-white dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
            >
              {ex.length > 52 ? `${ex.slice(0, 52)}…` : ex}
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
            <h2 className="mb-2 text-lg font-semibold">
              {result.mode === "app" ? "App plan" : "Workflow"}
            </h2>
            <div className="prose prose-sm max-w-none whitespace-pre-wrap dark:prose-invert">
              {result.workflow}
            </div>
          </section>

          {result.mode === "app" && result.app ? (
            <AgentAppBlueprintView app={result.app} />
          ) : null}

          {result.steps.length > 1 ? (
            <div className="rounded-lg border border-sky-300/50 bg-sky-50/40 px-4 py-3 text-sm dark:border-sky-900 dark:bg-sky-950/30">
              <strong className="text-sky-900 dark:text-sky-200">Run in sequence:</strong>{" "}
              Execute steps 1 → {result.steps.length} in order. Edit parameters in each step&apos;s
              panel before clicking Run — values from earlier steps (e.g. collection IDs) may be
              required for later ones.
            </div>
          ) : null}

          {result.steps.map((step) => (
            <AgentWorkflowStep
              key={`${step.order}-${step.slug}`}
              step={step}
              language={language}
              totalSteps={result.steps.length}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
