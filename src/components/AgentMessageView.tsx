"use client";

import { useEffect, useMemo } from "react";
import { AgentAppBlueprintView } from "./AgentAppBlueprintView";
import { AgentAppDiffView } from "./AgentAppDiffView";
import { AgentWorkflowScript } from "./AgentWorkflowScript";
import { AgentWorkflowStep } from "./AgentWorkflowStep";
import type { AgentLanguage, AgentResponse } from "@/lib/agent/types";
import { setWorkflowTagName } from "@/lib/workflow-step-context";

export function AgentMessageView({
  response,
  language,
  workflowId,
  onDeploySuccess,
  compactAppFiles,
}: {
  response: AgentResponse;
  language: AgentLanguage;
  workflowId?: string;
  onDeploySuccess?: (info: {
    deploymentUrl: string;
    deploymentId: string;
    projectName: string;
  }) => void;
  /** Hide full file browser when the workspace project panel shows files. */
  compactAppFiles?: boolean;
}) {
  const tagName = useMemo(() => {
    if (response.tagName?.trim()) return response.tagName.trim();
    for (const s of response.steps) {
      if (!s.slug.includes("create-tag") || !s.request.body) continue;
      try {
        const parsed = JSON.parse(s.request.body) as { name?: string };
        if (parsed.name?.trim()) return parsed.name.trim();
      } catch {
        /* ignore */
      }
    }
    return undefined;
  }, [response.steps, response.tagName]);

  useEffect(() => {
    if (workflowId && tagName) setWorkflowTagName(workflowId, tagName);
  }, [workflowId, tagName]);

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
        compactAppFiles ? (
          <p className="rounded-lg border border-indigo-200/60 bg-indigo-50/40 px-3 py-2 text-xs text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-200">
            {response.app.files.length} project files ready — open the <strong>Project</strong> panel on
            the right to browse, preview, deploy, or download.
          </p>
        ) : (
          <AgentAppBlueprintView app={response.app} onDeploySuccess={onDeploySuccess} />
        )
      ) : null}

      {response.docsModeNote ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
          {response.docsModeNote}
        </div>
      ) : null}

      {response.steps.length > 1 ? (
        <div className="rounded-lg border border-sky-300/50 bg-sky-50/40 px-3 py-2 text-xs dark:border-sky-900 dark:bg-sky-950/30">
          <strong className="text-sky-900 dark:text-sky-200">Next steps:</strong>{" "}
          Follow steps 1 → {response.steps.length} in order. Example code uses placeholders like{" "}
          <code className="font-mono">&lt;BASE_URL&gt;</code> — a developer adds real credentials.
        </div>
      ) : null}

      {response.steps.map((step) => (
        <AgentWorkflowStep
          key={`${step.order}-${step.slug}`}
          step={step}
          language={language}
          totalSteps={response.steps.length}
          workflowId={workflowId}
        />
      ))}

      {response.mode === "workflow" && response.scripts && response.scripts.length > 0 ? (
        <AgentWorkflowScript scripts={response.scripts} />
      ) : null}

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
