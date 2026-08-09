"use client";

import { useState } from "react";
import { ExternalLink, Upload, X } from "lucide-react";
import { useFocusTrap } from "./useFocusTrap";
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
import { withCsrfHeaders } from "@/lib/csrf-client";

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
  const dialogRef = useFocusTrap(true, onClose);

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
        headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
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
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-from-vercel-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--surface-overlay)] p-4"
    >
      <div className="atlas-panel w-full max-w-md shadow-[var(--shadow-floating)]">
        <div className="atlas-panel__header">
          <div>
            <p className="atlas-micro-label" style={{ color: "var(--accent-ai)" }}>
              Import
            </p>
            <h2 id="import-from-vercel-title" className="text-sm font-semibold text-[var(--text-heading)]">
              Import from Vercel
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Pull source files from a live deployment to edit in place.
            </p>
          </div>
          <button type="button" aria-label="Close import dialog" onClick={onClose} className="atlas-icon-btn">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="space-y-3 p-5">
          <label className="block text-xs">
            <span className="atlas-micro-label mb-1">Deployment URL</span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-app.vercel.app"
              className="w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-2.5 py-1.5 font-mono text-xs text-[var(--text-primary)]"
            />
          </label>
          <label className="block text-xs">
            <span className="atlas-micro-label mb-1">Vercel token</span>
            <input
              type="password"
              value={token}
              onChange={(e) => setVercelToken(e.target.value)}
              placeholder="vercel_…"
              className="w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-2.5 py-1.5 font-mono text-xs text-[var(--text-primary)]"
            />
          </label>
          {error ? (
            <p
              role="alert"
              className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--danger)_40%,var(--border-subtle))] bg-[var(--danger-soft)] px-2 py-1.5 text-xs text-[var(--danger)]"
            >
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={loading || !url.trim() || !token.trim()}
              onClick={() => void pull()}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--accent-ai)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              {loading ? "Importing…" : "Import"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-[var(--radius-sm)] border border-[var(--border-default)] px-4 py-2 text-sm text-[var(--text-secondary)]"
            >
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
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-4 py-2">
        <span className="font-mono text-[11px] text-[var(--text-muted)]">
          No saved apps yet — build one or import from Vercel
        </span>
        <button
          type="button"
          onClick={onImportClick}
          className="ml-auto inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border-default)] px-2 py-0.5 font-mono text-[11px] font-medium text-[var(--text-secondary)] hover:border-[color-mix(in_srgb,var(--accent-ai)_35%,var(--border-default))] hover:text-[var(--accent-ai)]"
        >
          <Upload className="h-3 w-3" aria-hidden="true" />
          Import from Vercel
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-4 py-2">
      <span className="atlas-micro-label">Project</span>
      <select
        aria-label="Active project"
        value={activeAppId ?? ""}
        onChange={(e) => {
          const id = e.target.value || null;
          setActiveAppId(id);
          onSelectApp(id);
        }}
        className="max-w-[200px] rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-primary)]"
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
          className="inline-flex items-center gap-1 font-mono text-[11px] text-[var(--text-link)] hover:underline"
        >
          live
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
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
          className="font-mono text-[11px] text-[var(--danger)] hover:underline"
        >
          Delete
        </button>
      ) : null}
      <button
        type="button"
        onClick={onImportClick}
        className="ml-auto inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border-default)] px-2 py-0.5 font-mono text-[11px] font-medium text-[var(--text-secondary)] hover:border-[color-mix(in_srgb,var(--accent-ai)_35%,var(--border-default))] hover:text-[var(--accent-ai)]"
      >
        <Upload className="h-3 w-3" aria-hidden="true" />
        Import from Vercel
      </button>
    </div>
  );
}

export { blueprintFromVersion, getLatestVersion, getSavedApp };
