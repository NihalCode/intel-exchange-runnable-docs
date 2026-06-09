"use client";

import type { AgentAppBlueprint, SavedAppProject, SavedAppVersion } from "@/lib/agent/types";
import { slugifyProjectName } from "@/lib/agent/app-diff";

const APPS_KEY = "cyware-agent-saved-apps";
const ACTIVE_KEY = "cyware-agent-active-app-id";

function readApps(): SavedAppProject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(APPS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedAppProject[];
  } catch {
    return [];
  }
}

function writeApps(apps: SavedAppProject[]) {
  localStorage.setItem(APPS_KEY, JSON.stringify(apps));
}

export function loadSavedApps(): SavedAppProject[] {
  return readApps().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function loadActiveAppId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveAppId(id: string | null) {
  if (id) localStorage.setItem(ACTIVE_KEY, id);
  else localStorage.removeItem(ACTIVE_KEY);
}

export function getSavedApp(id: string): SavedAppProject | undefined {
  return readApps().find((a) => a.id === id);
}

export function getLatestVersion(app: SavedAppProject): SavedAppVersion | undefined {
  return app.versions[app.versions.length - 1];
}

export function blueprintFromVersion(
  app: SavedAppProject,
  version: SavedAppVersion
): AgentAppBlueprint {
  return {
    title: app.title,
    description: version.summary,
    architecture: [
      "Browser (React UI)",
      "  ↓ fetch /api/cyware/*",
      "Next.js API Routes (server)",
      "  ↓ HMAC-signed requests",
      "Cyware Intel Exchange Open API",
    ].join("\n"),
    setupInstructions:
      "Copy .env.example → .env.local, add Cyware credentials, npm install && npm run dev.",
    envExample: version.files.find((f) => f.path === ".env.example")?.code ?? "",
    files: version.files.map((f) => ({
      path: f.path,
      code: f.code,
      language: f.language ?? "typescript",
      description: f.description ?? f.path,
    })),
    appId: app.id,
    version: version.version,
    vercelProjectName: app.vercelProjectName,
    deploymentUrl: app.deploymentUrl,
    deploymentId: app.deploymentId,
  };
}

export function saveAppVersion(opts: {
  appId?: string;
  title: string;
  summary: string;
  files: AgentAppBlueprint["files"];
  deploymentUrl?: string;
  deploymentId?: string;
  vercelProjectName?: string;
}): SavedAppProject {
  const apps = readApps();
  const now = new Date().toISOString();
  const vercelProjectName = opts.vercelProjectName ?? slugifyProjectName(opts.title);

  let app: SavedAppProject;
  if (opts.appId) {
    const existing = apps.find((a) => a.id === opts.appId);
    if (existing) {
      app = existing;
    } else {
      app = {
        id: opts.appId,
        title: opts.title,
        vercelProjectName,
        updatedAt: now,
        versions: [],
      };
      apps.push(app);
    }
  } else {
    app = {
      id: `app-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: opts.title,
      vercelProjectName,
      updatedAt: now,
      versions: [],
    };
    apps.push(app);
  }

  app.title = opts.title;
  app.updatedAt = now;
  app.vercelProjectName = vercelProjectName;
  if (opts.deploymentUrl) app.deploymentUrl = opts.deploymentUrl;
  if (opts.deploymentId) app.deploymentId = opts.deploymentId;

  const version: SavedAppVersion = {
    version: app.versions.length + 1,
    createdAt: now,
    summary: opts.summary,
    files: opts.files.map((f) => ({
      path: f.path,
      code: f.code,
      language: f.language,
      description: f.description,
    })),
  };
  app.versions.push(version);

  writeApps(apps);
  setActiveAppId(app.id);
  return app;
}

export function importAppProject(project: SavedAppProject): SavedAppProject {
  const apps = readApps().filter((a) => a.id !== project.id);
  apps.push(project);
  writeApps(apps);
  setActiveAppId(project.id);
  return project;
}

export function deleteSavedApp(id: string) {
  const apps = readApps().filter((a) => a.id !== id);
  writeApps(apps);
  if (loadActiveAppId() === id) setActiveAppId(null);
}
