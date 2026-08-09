"use client";

import { useMemo } from "react";
import {
  Download,
  Eye,
  GitCommitHorizontal,
  Rocket,
} from "lucide-react";
import type { AgentAppBlueprint } from "@/lib/agent/types";
import { isLiveApiUiEnabled } from "@/lib/public-docs-mode";

function sortPaths(files: NonNullable<AgentAppBlueprint["files"]>): AgentAppBlueprint["files"] {
  return [...files].sort((a, b) => a.path.localeCompare(b.path));
}

export function AgentProjectPanel({
  app,
  selectedPath,
  onSelectPath,
  logs,
  onPreview,
  onDeploy,
  onCommit,
  onDownloadZip,
  deploying,
  committing,
}: {
  app?: AgentAppBlueprint;
  selectedPath: string | null;
  onSelectPath: (path: string) => void;
  logs: string[];
  onPreview?: () => void;
  onDeploy?: () => void;
  onCommit?: () => void;
  onDownloadZip?: () => void;
  deploying: boolean;
  committing: boolean;
}) {
  const files = useMemo(() => (app?.files ? sortPaths(app.files) : []), [app]);
  const selected = files.find((f) => f.path === selectedPath) ?? files[0];
  const mockPreview = !isLiveApiUiEnabled();

  return (
    <aside className="atlas-panel" data-layout="cx-build-app-panel">
      <div className="atlas-panel__header">
        <div>
          <p className="atlas-micro-label" style={{ color: "var(--accent-ai)" }}>
            Build App
          </p>
          <p className="mt-0.5 truncate text-[11px] text-[var(--text-secondary)]">
            {app?.title ?? "No project loaded — ask Ask AI to generate an app"}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
          {onPreview ? (
            <button
              type="button"
              disabled={!app}
              onClick={onPreview}
              className="atlas-btn-ghost atlas-btn-sm inline-flex min-h-8 items-center gap-1"
              title="Preview"
              aria-label="Preview"
            >
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              Preview
            </button>
          ) : null}
          {onDeploy ? (
            <button
              type="button"
              disabled={!app || deploying}
              onClick={onDeploy}
              className="inline-flex min-h-8 items-center gap-1 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--accent-ai)_40%,transparent)] bg-[var(--accent-ai)] px-2 text-[11px] font-semibold text-white disabled:opacity-40"
              title="Deploy"
            >
              <Rocket className="h-3 w-3" aria-hidden="true" />
              {deploying ? "Deploying…" : "Deploy"}
            </button>
          ) : null}
          {onCommit ? (
            <button
              type="button"
              disabled={!app || committing}
              onClick={onCommit}
              className="atlas-btn-ghost atlas-btn-sm inline-flex min-h-8 items-center gap-1"
              title="Commit"
              aria-label={committing ? "Committing" : "Commit"}
            >
              <GitCommitHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              {committing ? "Committing…" : "Commit"}
            </button>
          ) : null}
          {onDownloadZip ? (
            <button
              type="button"
              disabled={!app}
              onClick={onDownloadZip}
              className="atlas-btn-ghost atlas-btn-sm inline-flex min-h-8 items-center gap-1"
              title="Download"
              aria-label="Download project zip"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Download
            </button>
          ) : null}
        </div>
      </div>

      {!app ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center font-mono text-[11px] text-[var(--text-muted)]">
          Ask me to build an app or fetch API examples — your project files will appear here.
        </div>
      ) : (
        <>
          <div className="border-b border-[var(--border-subtle)] px-3 py-2 text-[11px]">
            <div className="font-semibold text-[var(--text-heading)]">{app.title}</div>
            {mockPreview ? (
              <p className="mt-1 text-[var(--warning)]">
                Preview uses sample data — live API calls need developer credentials.
              </p>
            ) : (
              <p className="mt-1 text-[var(--success)]">Live API mode available.</p>
            )}
            {app.deploymentUrl ? (
              <a
                href={app.deploymentUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block truncate font-mono text-[var(--text-link)] hover:underline"
              >
                {app.deploymentUrl}
              </a>
            ) : null}
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="max-h-36 overflow-y-auto border-b border-[var(--border-subtle)] p-2">
              <p className="atlas-micro-label mb-1">Files</p>
              <ul className="space-y-0.5">
                {files.map((f) => (
                  <li key={f.path}>
                    <button
                      type="button"
                      onClick={() => onSelectPath(f.path)}
                      className={`w-full truncate rounded-[var(--radius-sm)] px-2 py-0.5 text-left font-mono text-[10px] ${
                        selected?.path === f.path
                          ? "bg-[var(--accent-ai-soft)] text-[var(--accent-ai)]"
                          : "text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]"
                      }`}
                    >
                      {f.path}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-2">
              {selected ? (
                <pre className="atlas-code-deck whitespace-pre-wrap break-words p-2 font-mono text-[10px] leading-relaxed">
                  {selected.code}
                </pre>
              ) : null}
            </div>
          </div>
        </>
      )}

      <div className="h-28 shrink-0 overflow-y-auto border-t border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-2">
        <p className="atlas-micro-label mb-1">Activity</p>
        {logs.length === 0 ? (
          <p className="font-mono text-[10px] text-[var(--text-muted)]">
            Run, deploy, and commit actions appear here.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {logs.slice(-8).map((line, i) => (
              <li key={`${i}-${line}`} className="font-mono text-[10px] text-[var(--text-secondary)]">
                {line}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
