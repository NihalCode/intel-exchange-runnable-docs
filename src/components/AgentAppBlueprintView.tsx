"use client";

import { useState } from "react";
import { CodeBlock } from "./CodeBlock";
import type { AgentAppBlueprint } from "@/lib/agent/types";
import type { CodeSnippet } from "@/lib/types";

interface DeployState {
  vercelToken: string;
  baseUrl: string;
  accessId: string;
  secretKey: string;
}

interface DeployResult {
  url: string | null;
  deploymentId: string | null;
  message: string;
  inspectorUrl?: string;
}

function DeployModal({
  app,
  onClose,
}: {
  app: AgentAppBlueprint;
  onClose: () => void;
}) {
  const [form, setForm] = useState<DeployState>({
    vercelToken: "",
    baseUrl: "",
    accessId: "",
    secretKey: "",
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DeployResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function set(k: keyof DeployState) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [k]: e.target.value }));
  }

  async function deploy() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: app.files.map((f) => ({ path: f.path, code: f.code })),
          appName: app.title,
          vercelToken: form.vercelToken.trim(),
          envVars: {
            CYWARE_BASE_URL: form.baseUrl.trim(),
            CYWARE_ACCESS_ID: form.accessId.trim(),
            CYWARE_SECRET_KEY: form.secretKey.trim(),
          },
        }),
      });
      const data = (await res.json()) as DeployResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Deployment failed");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deployment failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-semibold">Deploy to Vercel</h2>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
            <CloseIcon />
          </button>
        </div>

        {result ? (
          <div className="space-y-4 p-5">
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/30">
              <p className="font-semibold text-emerald-800 dark:text-emerald-200">Deployment started!</p>
              <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">{result.message}</p>
            </div>
            {result.url && (
              <a
                href={result.url}
                target="_blank"
                rel="noreferrer"
                className="block truncate rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 font-mono text-sm text-sky-700 hover:underline dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300"
              >
                {result.url}
              </a>
            )}
            {result.inspectorUrl && (
              <a
                href={result.inspectorUrl}
                target="_blank"
                rel="noreferrer"
                className="block text-xs text-zinc-500 hover:underline"
              >
                View in Vercel dashboard →
              </a>
            )}
            <button type="button" onClick={onClose} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-700">
              Close
            </button>
          </div>
        ) : (
          <div className="space-y-4 p-5">
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Your Cyware credentials are sent directly to Vercel and set as deployment environment variables.
              They are not stored anywhere else.
            </p>

            <div className="rounded-md border border-amber-300/60 bg-amber-50/60 p-2.5 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              Get a Vercel token at{" "}
              <a
                href="https://vercel.com/account/tokens"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                vercel.com/account/tokens
              </a>{" "}
              — scope: All Projects.
            </div>

            <label className="block text-xs">
              <span className="mb-1 block font-semibold">Vercel Token <span className="text-red-500">*</span></span>
              <input
                type="password"
                value={form.vercelToken}
                onChange={set("vercelToken")}
                placeholder="vercel_xxxxxxxxxxxx"
                className="w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 font-mono text-xs outline-none focus:border-sky-500 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>

            <div className="border-t border-zinc-100 pt-3 dark:border-zinc-800">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Cyware credentials (for deployed app)</p>
              <div className="space-y-2">
                {[
                  { key: "baseUrl" as const, label: "CYWARE_BASE_URL", placeholder: "https://your-tenant.cyware.com/ctixapi" },
                  { key: "accessId" as const, label: "CYWARE_ACCESS_ID", placeholder: "Your Access ID" },
                  { key: "secretKey" as const, label: "CYWARE_SECRET_KEY", placeholder: "Your Secret Key" },
                ].map(({ key, label, placeholder }) => (
                  <label key={key} className="block text-xs">
                    <span className="mb-1 block font-semibold">{label} <span className="text-red-500">*</span></span>
                    <input
                      type={key === "secretKey" ? "password" : "text"}
                      value={form[key]}
                      onChange={set(key)}
                      placeholder={placeholder}
                      className="w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 font-mono text-xs outline-none focus:border-sky-500 dark:border-zinc-700 dark:bg-zinc-900"
                    />
                  </label>
                ))}
              </div>
            </div>

            {error && (
              <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={deploy}
                disabled={loading || !form.vercelToken || !form.baseUrl || !form.accessId || !form.secretKey}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {loading ? "Deploying…" : "Deploy now"}
              </button>
              <button type="button" onClick={onClose} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function AgentAppBlueprintView({ app }: { app: AgentAppBlueprint }) {
  const [activePath, setActivePath] = useState(app.files[0]?.path ?? "");
  const [showDeploy, setShowDeploy] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const activeFile = app.files.find((f) => f.path === activePath) ?? app.files[0];

  const langMap: Record<string, string> = {
    typescript: "typescript",
    json: "json",
    css: "css",
    markdown: "markdown",
    bash: "bash",
  };

  const snippet: CodeSnippet | null = activeFile
    ? {
        lang: langMap[activeFile.language] ?? "typescript",
        label: activeFile.path,
        code: activeFile.code,
        runKind: "none",
      }
    : null;

  async function downloadZip() {
    setDownloading(true);
    try {
      const res = await fetch("/api/agent/zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: app.files.map((f) => ({ path: f.path, code: f.code })),
          appName: app.title,
        }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "Download failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${app.title.toLowerCase().replace(/\s+/g, "-")}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }

  const fileGroups = {
    boilerplate: app.files.filter((f) => ["package.json", "tsconfig.json", "next.config.ts", "app/layout.tsx", "app/globals.css", ".env.example"].includes(f.path)),
    client: app.files.filter((f) => f.path.startsWith("lib/")),
    routes: app.files.filter((f) => f.path.startsWith("app/api/")),
    frontend: app.files.filter((f) => f.path === "app/page.tsx"),
    docs: app.files.filter((f) => f.path === "README.md"),
  };

  function FileButton({ file }: { file: typeof app.files[0] }) {
    const filename = file.path.split("/").pop() ?? file.path;
    return (
      <button
        type="button"
        onClick={() => setActivePath(file.path)}
        title={file.path}
        className={`group flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-[11px] transition ${
          activePath === file.path
            ? "bg-indigo-600 text-white"
            : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
        }`}
      >
        <span className="truncate font-mono">{filename}</span>
      </button>
    );
  }

  function FileGroup({ label, files }: { label: string; files: typeof app.files }) {
    if (files.length === 0) return null;
    return (
      <div>
        <div className="mb-0.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{label}</div>
        {files.map((f) => <FileButton key={f.path} file={f} />)}
      </div>
    );
  }

  return (
    <>
      {showDeploy && <DeployModal app={app} onClose={() => setShowDeploy(false)} />}

      <section className="space-y-4 rounded-xl border border-indigo-300/50 bg-indigo-50/20 p-4 dark:border-indigo-900 dark:bg-indigo-950/20">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-indigo-950 dark:text-indigo-100">{app.title}</h2>
            <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">{app.files.length} files — complete, deployable Next.js app</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={downloadZip}
              disabled={downloading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            >
              <DownloadIcon />
              {downloading ? "Preparing…" : "Download .zip"}
            </button>
            <button
              type="button"
              onClick={() => setShowDeploy(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              <VercelIcon />
              Deploy to Vercel
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-zinc-200 bg-white/60 p-2.5 dark:border-zinc-800 dark:bg-zinc-950/40">
            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Architecture</p>
            <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-zinc-700 dark:text-zinc-300">{app.architecture}</pre>
          </div>
          <div className="rounded-md border border-emerald-200/70 bg-emerald-50/50 p-2.5 dark:border-emerald-900 dark:bg-emerald-950/20 sm:col-span-2">
            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Setup (3 steps)</p>
            <ol className="list-decimal pl-4 text-[11px] text-emerald-800 dark:text-emerald-300">
              <li>Download .zip → unzip → <code className="font-mono">cp .env.example .env.local</code></li>
              <li>Fill in <code className="font-mono">CYWARE_BASE_URL</code>, <code className="font-mono">CYWARE_ACCESS_ID</code>, <code className="font-mono">CYWARE_SECRET_KEY</code></li>
              <li><code className="font-mono">npm install && npm run dev</code></li>
            </ol>
          </div>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row">
          <nav className="flex shrink-0 flex-row flex-wrap gap-1 lg:w-52 lg:flex-col lg:flex-nowrap lg:overflow-visible">
            <FileGroup label="Boilerplate" files={fileGroups.boilerplate} />
            <FileGroup label="Cyware Client" files={fileGroups.client} />
            <FileGroup label="API Routes" files={fileGroups.routes} />
            <FileGroup label="Frontend" files={fileGroups.frontend} />
            <FileGroup label="Docs" files={fileGroups.docs} />
          </nav>

          <div className="min-w-0 flex-1">
            {activeFile ? (
              <>
                <p className="mb-1 text-[11px] text-zinc-500 dark:text-zinc-500">
                  <span className="font-mono font-semibold text-zinc-700 dark:text-zinc-300">{activeFile.path}</span>
                  {" — "}{activeFile.description}
                </p>
                {snippet ? <CodeBlock snippet={snippet} /> : null}
              </>
            ) : null}
          </div>
        </div>
      </section>
    </>
  );
}

function DownloadIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" strokeLinecap="round" />
      <polyline points="7 10 12 15 17 10" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="15" x2="12" y2="3" strokeLinecap="round" />
    </svg>
  );
}

function VercelIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L2 19.5h20L12 2z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
    </svg>
  );
}
