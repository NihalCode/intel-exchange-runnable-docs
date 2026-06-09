"use client";

import { AgentAppBlueprintView } from "./AgentAppBlueprintView";
import { AgentAppDiffView } from "./AgentAppDiffView";
import { AgentWorkflowStep } from "./AgentWorkflowStep";
import type { AgentLanguage, AgentResponse } from "@/lib/agent/types";

export function AgentMessageView({
  response,
  language,
  onDeploySuccess,
}: {
  response: AgentResponse;
  language: AgentLanguage;
  onDeploySuccess?: (info: {
    deploymentUrl: string;
    deploymentId: string;
    projectName: string;
  }) => void;
}) {
  return (
    <div className="space-y-4">
      {response.fallback ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          Low confidence match — review carefully or refine your question.
        </div>
      ) : null}

      {response.questions && response.questions.length > 0 ? (
        <div className="rounded-lg border border-sky-300/50 bg-sky-50/40 px-3 py-2 text-sm dark:border-sky-900 dark:bg-sky-950/30">
          <p className="mb-1 font-semibold text-sky-900 dark:text-sky-200">Clarifying questions</p>
          <ul className="list-disc space-y-0.5 pl-4 text-sky-800 dark:text-sky-300">
            {response.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {response.appDiff ? <AgentAppDiffView diff={response.appDiff} /> : null}

      {response.mode === "app" && response.app ? (
        <AgentAppBlueprintView app={response.app} onDeploySuccess={onDeploySuccess} />
      ) : null}

      {response.steps.length > 1 ? (
        <div className="rounded-lg border border-sky-300/50 bg-sky-50/40 px-3 py-2 text-xs dark:border-sky-900 dark:bg-sky-950/30">
          <strong className="text-sky-900 dark:text-sky-200">Run in sequence:</strong>{" "}
          Execute steps 1 → {response.steps.length}. Edit parameters before Run.
        </div>
      ) : null}

      {response.steps.map((step) => (
        <AgentWorkflowStep
          key={`${step.order}-${step.slug}`}
          step={step}
          language={language}
          totalSteps={response.steps.length}
        />
      ))}

      {response.citations.length > 0 ? (
        <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            Sources
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {response.citations.map((c) => (
              <li key={c.slug}>
                <a
                  href={c.url}
                  className="rounded-full border border-zinc-200 px-2 py-0.5 text-[11px] text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
                >
                  {c.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
