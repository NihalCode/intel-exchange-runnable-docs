"use client";

import Link from "next/link";
import { useMemo } from "react";
import { CodeBlock } from "./CodeBlock";
import {
  RequestPlaygroundPanel,
  RequestPlaygroundProvider,
} from "./RequestPlayground";
import { codeForRunnableRequest } from "@/lib/snippets";
import type { AgentLanguage, AgentStepResult } from "@/lib/agent/types";
import type { CodeSnippet } from "@/lib/types";

function SpecTable({
  title,
  rows,
}: {
  title: string;
  rows: { name: string; type: string; required: boolean; description?: string; example?: string }[];
}) {
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
      <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide dark:border-zinc-800 dark:bg-zinc-900">
        {title}
      </div>
      <table className="w-full text-left text-xs">
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-t border-zinc-100 dark:border-zinc-800">
              <td className="px-3 py-1.5 font-mono font-semibold">{r.name}</td>
              <td className="px-3 py-1.5 text-zinc-500">{r.type}</td>
              <td className="px-3 py-1.5">
                {r.required ? (
                  <span className="text-red-600 dark:text-red-400">required</span>
                ) : (
                  <span className="text-zinc-400">optional</span>
                )}
              </td>
              <td className="px-3 py-1.5 text-zinc-600 dark:text-zinc-400">
                {r.description ?? r.example ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function snippetForStep(
  step: AgentStepResult,
  language: AgentLanguage
): CodeSnippet {
  const langMap: Record<
    AgentLanguage,
    { lang: string; label: string; runKind: CodeSnippet["runKind"] }
  > = {
    python: { lang: "python", label: "Python", runKind: "python" },
    javascript: { lang: "javascript", label: "JavaScript", runKind: "javascript" },
    curl: { lang: "bash", label: "cURL", runKind: "http" },
    java: { lang: "java", label: "Java", runKind: "none" },
    go: { lang: "go", label: "Go", runKind: "none" },
  };
  const meta = langMap[language];
  const code =
    language === "java" || language === "go"
      ? step.code
      : codeForRunnableRequest(step.request, language);
  return {
    lang: meta.lang,
    label: meta.label,
    code,
    runKind: meta.runKind,
    request: meta.runKind === "http" ? step.request : undefined,
  };
}

export function AgentWorkflowStep({
  step,
  language,
  totalSteps,
}: {
  step: AgentStepResult;
  language: AgentLanguage;
  totalSteps: number;
}) {
  const snippet = useMemo(() => snippetForStep(step, language), [step, language]);

  return (
    <section className="rounded-xl border border-zinc-200 dark:border-zinc-800">
      <div className="border-b border-zinc-200 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/40">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="rounded bg-sky-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
            Step {step.order} of {totalSteps}
          </span>
          <h3 className="text-base font-semibold">{step.title}</h3>
          <code className="text-xs text-sky-600 dark:text-sky-400">
            {step.method} {step.path}
          </code>
          <Link href={step.docUrl} className="text-xs underline text-zinc-500">
            View docs
          </Link>
        </div>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{step.explanation}</p>
        {step.order < totalSteps ? (
          <p className="mt-1 text-[11px] text-zinc-500">
            Complete this step before moving to step {step.order + 1}. Output (e.g. IDs) may be needed as input for later steps.
          </p>
        ) : null}
      </div>

      <div className="space-y-4 p-4">
        {step.warnings.map((w) => (
          <p key={w} className="text-xs text-amber-700 dark:text-amber-400">
            {w}
          </p>
        ))}

        <div className="rounded-lg border border-violet-300/50 bg-violet-50/30 p-3 dark:border-violet-900 dark:bg-violet-950/20">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-800 dark:text-violet-300">
            API call specification
          </h4>
          <dl className="grid gap-1 text-xs sm:grid-cols-2">
            <div>
              <dt className="font-semibold text-zinc-500">Endpoint</dt>
              <dd className="font-mono break-all">{step.spec.endpoint}</dd>
            </div>
            <div>
              <dt className="font-semibold text-zinc-500">Method</dt>
              <dd>{step.spec.method}</dd>
            </div>
            <div>
              <dt className="font-semibold text-zinc-500">Content-Type</dt>
              <dd>{step.spec.multipart ? "multipart/form-data" : step.spec.contentType}</dd>
            </div>
            <div>
              <dt className="font-semibold text-zinc-500">Auth</dt>
              <dd>{step.spec.auth.type} — {step.spec.auth.queryParams.join(", ")}</dd>
            </div>
          </dl>
          <p className="mt-2 text-[11px] text-zinc-600 dark:text-zinc-400">{step.spec.auth.description}</p>
        </div>

        <div className="grid gap-2">
          <SpecTable title="Path parameters" rows={step.spec.pathParameters} />
          <SpecTable title="Query parameters" rows={step.spec.queryParameters} />
          <SpecTable title="Body fields" rows={step.spec.bodyParameters} />
          <SpecTable title="Headers" rows={step.spec.headers} />
        </div>

        {step.spec.expectedResponse ? (
          <div className="rounded-md border border-emerald-300/50 bg-emerald-50/30 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
            <div className="mb-1 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              Expected response ({step.spec.expectedResponse.statusCode})
            </div>
            {step.spec.expectedResponse.description ? (
              <p className="mb-2 text-[11px] text-zinc-600 dark:text-zinc-400">
                {step.spec.expectedResponse.description}
              </p>
            ) : null}
            {step.spec.expectedResponse.example ? (
              <pre className="max-h-40 overflow-auto rounded bg-white/60 p-2 font-mono text-[11px] dark:bg-zinc-950">
                {step.spec.expectedResponse.example}
              </pre>
            ) : null}
          </div>
        ) : null}

        <RequestPlaygroundProvider request={step.request} meta={step.meta} storageId={step.slug}>
          <RequestPlaygroundPanel />
          <p className="text-[11px] text-zinc-500">
            Edit path, query, body, and form fields above — the Run button uses your values, not the static snippet text.
          </p>
          <CodeBlock snippet={snippet} />
        </RequestPlaygroundProvider>
      </div>
    </section>
  );
}
