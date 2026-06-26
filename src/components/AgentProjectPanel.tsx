"use client";

import { useMemo } from "react";
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
  onPreview: () => void;
  onDeploy: () => void;
  onCommit: () => void;
  onDownloadZip: () => void;
  deploying: boolean;
  committing: boolean;
}) {
  const files = useMemo(() => (app?.files ? sortPaths(app.files) : []), [app?.files]);
  const selected = files.find((f) => f.path === selectedPath) ?? files[0];
  const mockPreview = !isLiveApiUiEnabled();

  return (
    <aside className="flex w-[min(420px,38vw)] shrink-0 flex-col border-l border-zinc-200 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/30">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <span className="mr-auto text-xs font-semibold text-zinc-600 dark:text-zinc-400">Project</span>
        <button
          type="button"
          disabled={!app}
          onClick={onPreview}
          className="rounded-md border border-zinc-300 px-2 py-0.5 text-[11px] font-medium hover:bg-white disabled:opacity-40 dark:border-zinc-700"
        >
          Preview
        </button>
        <button
          type="button"
          disabled={!app || deploying}
          onClick={onDeploy}
          className="rounded-md bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
        >
          {deploying ? "Deploying…" : "Deploy"}
        </button>
        <button
          type="button"
          disabled={!app || committing}
          onClick={onCommit}
          className="rounded-md border border-zinc-300 px-2 py-0.5 text-[11px] font-medium hover:bg-white disabled:opacity-40 dark:border-zinc-700"
        >
          {committing ? "Saving…" : "Commit"}
        </button>
        <button
          type="button"
          disabled={!app}
          onClick={onDownloadZip}
          className="rounded-md border border-zinc-300 px-2 py-0.5 text-[11px] font-medium hover:bg-white disabled:opacity-40 dark:border-zinc-700"
        >
          Download
        </button>
      </div>

      {!app ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-zinc-500">
          Ask me to build an app or fetch API examples — your project files will appear here.
        </div>
      ) : (
        <>
          <div className="border-b border-zinc-200 px-3 py-2 text-[11px] dark:border-zinc-800">
            <div className="font-semibold text-zinc-800 dark:text-zinc-200">{app.title}</div>
            {mockPreview ? (
              <p className="mt-1 text-amber-700 dark:text-amber-300">
                Preview uses sample data — live API calls need developer credentials.
              </p>
            ) : (
              <p className="mt-1 text-emerald-700 dark:text-emerald-300">Live API mode available.</p>
            )}
            {app.deploymentUrl ? (
              <a
                href={app.deploymentUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block truncate text-sky-600 hover:underline"
              >
                {app.deploymentUrl}
              </a>
            ) : null}
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="max-h-36 overflow-y-auto border-b border-zinc-200 p-2 dark:border-zinc-800">
              <p className="mb-1 text-[10px] font-semibold uppercase text-zinc-400">Files</p>
              <ul className="space-y-0.5">
                {files.map((f) => (
                  <li key={f.path}>
                    <button
                      type="button"
                      onClick={() => onSelectPath(f.path)}
                      className={`w-full truncate rounded px-2 py-0.5 text-left font-mono text-[10px] ${
                        selected?.path === f.path
                          ? "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200"
                          : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
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
                <pre className="whitespace-pre-wrap break-words rounded-lg border border-zinc-200 bg-white p-2 font-mono text-[10px] leading-relaxed dark:border-zinc-800 dark:bg-zinc-950">
                  {selected.code}
                </pre>
              ) : null}
            </div>
          </div>
        </>
      )}

      <div className="h-28 shrink-0 overflow-y-auto border-t border-zinc-200 bg-zinc-100/80 p-2 dark:border-zinc-800 dark:bg-zinc-950/50">
        <p className="mb-1 text-[10px] font-semibold uppercase text-zinc-400">Activity</p>
        {logs.length === 0 ? (
          <p className="text-[10px] text-zinc-500">Run, deploy, and commit actions appear here.</p>
        ) : (
          <ul className="space-y-0.5">
            {logs.slice(-8).map((line, i) => (
              <li key={`${i}-${line}`} className="font-mono text-[10px] text-zinc-600 dark:text-zinc-400">
                {line}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
