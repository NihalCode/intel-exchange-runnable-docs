"use client";

import { useState } from "react";
import type { SavedAppProject } from "@/lib/agent/types";
import {
  loadDeploySettings,
  saveDeploySettings,
} from "@/lib/agent/deploy-settings-client";
import {
  blueprintFromVersion,
  deleteSavedApp,
  getLatestVersion,
  getSavedApp,
  importAppProject,
  loadSavedApps,
  setActiveAppId,
} from "@/lib/agent/saved-apps-client";

export function ImportVercelModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (appId: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [token, setToken] = useState(() => loadDeploySettings().vercelToken);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setVercelToken(value: string) {
    setToken(value);
    saveDeploySettings({ vercelToken: value });
  }

  async function pull() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/vercel/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deploymentUrl: url.trim(), vercelToken: token.trim() }),
      });
      const data = (await res.json()) as {
        error?: string;
        title: string;
        vercelProjectName: string;
        deploymentUrl: string;
        deploymentId: string;
        files: { path: string; code: string }[];
      };
      if (!res.ok) throw new Error(data.error ?? "Import failed");

      const now = new Date().toISOString();
      const project: SavedAppProject = {
        id: `app-${Date.now()}`,
        title: data.title,
        vercelProjectName: data.vercelProjectName,
        deploymentUrl: data.deploymentUrl,
        deploymentId: data.deploymentId,
        updatedAt: now,
        versions: [
          {
            version: 1,
            createdAt: now,
            summary: "Imported from Vercel deployment",
            files: data.files,
          },
        ],
      };
      importAppProject(project);
      onImported(project.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        <div className="border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-semibold">Import from Vercel</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Pull source files from a live deployment to edit in place.
          </p>
        </div>
        <div className="space-y-3 p-5">
          <label className="block text-xs">
            <span className="mb-1 block font-semibold">Deployment URL</span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-app.vercel.app"
              className="w-full rounded-md border border-zinc-300 px-2.5 py-1.5 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block font-semibold">Vercel token</span>
            <input
              type="password"
              value={token}
              onChange={(e) => setVercelToken(e.target.value)}
              placeholder="vercel_…"
              className="w-full rounded-md border border-zinc-300 px-2.5 py-1.5 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          {error ? (
            <p className="rounded-md border border-red-300 bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={loading || !url.trim() || !token.trim()}
              onClick={() => void pull()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {loading ? "Importing…" : "Import"}
            </button>
            <button type="button" onClick={onClose} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AgentSavedAppsBar({
  activeAppId,
  onSelectApp,
  onImportClick,
}: {
  activeAppId: string | null;
  onSelectApp: (appId: string | null) => void;
  onImportClick: () => void;
}) {
  const apps = loadSavedApps();
  const active = activeAppId ? getSavedApp(activeAppId) : undefined;

  if (apps.length === 0 && !active) {
    return (
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-zinc-50/50 px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900/30">
        <span className="text-[11px] text-zinc-500">No saved apps yet — build one or import from Vercel</span>
        <button
          type="button"
          onClick={onImportClick}
          className="ml-auto rounded-md border border-zinc-300 px-2 py-0.5 text-[11px] font-medium dark:border-zinc-700"
        >
          Import from Vercel
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-zinc-50/50 px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900/30">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Project</span>
      <select
        value={activeAppId ?? ""}
        onChange={(e) => {
          const id = e.target.value || null;
          setActiveAppId(id);
          onSelectApp(id);
        }}
        className="max-w-[200px] rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
      >
        <option value="">— New app —</option>
        {apps.map((a) => (
          <option key={a.id} value={a.id}>
            {a.title} (v{a.versions.length})
          </option>
        ))}
      </select>
      {active?.deploymentUrl ? (
        <a
          href={active.deploymentUrl}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-sky-600 hover:underline dark:text-sky-400"
        >
          live ↗
        </a>
      ) : null}
      {activeAppId ? (
        <button
          type="button"
          onClick={() => {
            if (confirm("Delete this saved app from browser storage?")) {
              deleteSavedApp(activeAppId);
              onSelectApp(null);
            }
          }}
          className="text-[11px] text-red-600 hover:underline"
        >
          Delete
        </button>
      ) : null}
      <button
        type="button"
        onClick={onImportClick}
        className="ml-auto rounded-md border border-zinc-300 px-2 py-0.5 text-[11px] font-medium dark:border-zinc-700"
      >
        Import from Vercel
      </button>
    </div>
  );
}

export { blueprintFromVersion, getLatestVersion, getSavedApp };
