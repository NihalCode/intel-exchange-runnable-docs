"use client";

import { useEffect, useMemo, useState } from "react";
import { AgentAppBlueprintView } from "./AgentAppBlueprintView";
import { AgentAppDiffView } from "./AgentAppDiffView";
import { AgentWorkflowScript } from "./AgentWorkflowScript";
import { AgentWorkflowStep } from "./AgentWorkflowStep";
import { shouldShowLowConfidenceBanner } from "@/lib/agent/answer-ux";
import type { AgentLanguage, AgentResponse } from "@/lib/agent/types";
import { setWorkflowTagName } from "@/lib/workflow-step-context";

function shouldShowStepsByDefault(response: AgentResponse): boolean {
  const style = response.responseStyle;
  if (style?.showTechnicalDetails) return true;
  if (style?.mode === "detailed" || style?.mode === "troubleshooting") return true;
  return false;
}

function shouldShowScriptsByDefault(response: AgentResponse): boolean {
  const style = response.responseStyle;
  if (!style?.includeCode || !response.scripts?.length) return false;
  return style.mode === "snippet" || style.snippet.required;
}

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
  const [showSteps, setShowSteps] = useState(() => shouldShowStepsByDefault(response));
  const [showScripts, setShowScripts] = useState(() => shouldShowScriptsByDefault(response));

  const style = response.responseStyle;
  const hasSteps = response.steps.length > 0;
  const hasScripts =
    response.mode === "workflow" && (response.scripts?.length ?? 0) > 0 && style?.includeCode !== false;
  const allowScripts = hasScripts && (style?.includeCode || style?.mode === "snippet");

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
      {shouldShowLowConfidenceBanner({
        fallback: response.fallback,
        retrievalEvidence: response.retrievalEvidence,
        stepCount: response.steps.length,
      }) ? (
        <div className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--warning)_45%,var(--border-subtle))] bg-[var(--warning-soft)] px-3 py-2 text-sm text-[var(--warning)]">
          Low confidence match — review carefully or refine your question.
        </div>
      ) : null}

      {response.questions && response.questions.length > 0 ? (
        <div className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--accent-ai)_35%,var(--border-subtle))] bg-[var(--accent-ai-soft)] px-3 py-2 text-sm">
          <p className="mb-1 font-semibold text-[var(--accent-ai)]">Clarifying questions</p>
          <ul className="list-disc space-y-0.5 pl-4 text-[var(--text-secondary)]">
            {response.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {response.appDiff ? <AgentAppDiffView diff={response.appDiff} /> : null}

      {response.mode === "app" && response.app ? (
        compactAppFiles ? (
          <p className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--accent-ai)_30%,var(--border-subtle))] bg-[var(--accent-ai-soft)] px-3 py-2 text-xs text-[var(--text-primary)]">
            {response.app.files.length} project files ready — open the <strong>Project</strong> panel on
            the right to browse, preview, deploy, or download.
          </p>
        ) : (
          <AgentAppBlueprintView app={response.app} onDeploySuccess={onDeploySuccess} />
        )
      ) : null}

      {response.docsModeNote ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--text-secondary)]">
          <strong>Note:</strong> {response.docsModeNote}
        </div>
      ) : null}

      {response.simpleMode ? (
        <p className="font-mono text-[10px] text-[var(--text-muted)]">
          Plain-English mode — ask to “show technical details” for more depth.
        </p>
      ) : null}

      {hasSteps && !showSteps ? (
        <button
          type="button"
          onClick={() => setShowSteps(true)}
          className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[color-mix(in_srgb,var(--accent-ai)_40%,var(--border-subtle))] hover:bg-[var(--accent-ai-soft)] hover:text-[var(--accent-ai)]"
        >
          Show API details
          {response.steps.length > 1 ? ` (${response.steps.length} steps)` : ""}
        </button>
      ) : null}

      {showSteps && hasSteps ? (
        <>
          {response.steps.length > 1 ? (
            <div className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--accent-ai)_30%,var(--border-subtle))] bg-[var(--accent-ai-soft)] px-3 py-2 text-xs">
              <strong className="text-[var(--accent-ai)]">Next steps:</strong>{" "}
              <span className="text-[var(--text-secondary)]">
                Follow steps 1 → {response.steps.length} in order. Example code uses placeholders like{" "}
                <code className="font-mono">&lt;BASE_URL&gt;</code> — a developer adds real credentials.
              </span>
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
        </>
      ) : null}

      {allowScripts && !showScripts ? (
        <button
          type="button"
          onClick={() => setShowScripts(true)}
          className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[color-mix(in_srgb,var(--accent-ai)_40%,var(--border-subtle))] hover:bg-[var(--accent-ai-soft)] hover:text-[var(--accent-ai)]"
        >
          Show example code
        </button>
      ) : null}

      {showScripts && allowScripts ? (
        <AgentWorkflowScript scripts={response.scripts!} />
      ) : null}

      {response.citations.length > 0 ? (
        <div id="sources" className="border-t border-[var(--border-subtle)] pt-3">
          <p className="atlas-micro-label mb-1.5">Sources</p>
          <ul className="flex flex-wrap gap-1.5">
            {response.citations.map((c) => (
              <li key={c.slug}>
                <a
                  href={c.url}
                  className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] transition hover:border-[color-mix(in_srgb,var(--accent-ai)_35%,var(--border-subtle))] hover:bg-[var(--surface-muted)] hover:text-[var(--text-link)]"
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
