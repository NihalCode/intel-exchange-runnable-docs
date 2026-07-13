"use client";

import { useEffect, useState } from "react";

type Feature = {
  key: string;
  enabled: boolean;
  allowedEnvironments: string[];
  allowedRoles: string[];
  version: number;
  modifiedAt: string | null;
};

async function csrfToken() {
  const response = await fetch("/api/admin/control-plane/context", { cache: "no-store" });
  return ((await response.json()) as { csrfToken: string }).csrfToken;
}

export function DocumentationFeaturesPage({ canManage }: { canManage: boolean }) {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/admin/documentation/features", { cache: "no-store" });
    if (!response.ok) return setError("Could not load documentation features.");
    setFeatures(((await response.json()) as { features: Feature[] }).features);
  }

  useEffect(() => {
    queueMicrotask(() => void load());
  }, []);

  async function toggle(feature: Feature) {
    setBusy(feature.key);
    setError("");
    try {
      const response = await fetch("/api/admin/documentation/features", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": await csrfToken() },
        body: JSON.stringify({
          key: feature.key,
          enabled: !feature.enabled,
          allowedEnvironments: feature.allowedEnvironments,
          allowedRoles: feature.allowedRoles,
          expectedVersion: feature.version,
        }),
      });
      if (!response.ok) setError("Feature update was rejected.");
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Documentation features</h1>
        <p className="mt-1 text-sm text-zinc-500">Organization-scoped runtime controls. Backend APIs enforce these settings.</p>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        {features.map((feature) => (
          <div key={feature.key} className="flex items-center justify-between gap-4 border-b border-zinc-200 px-4 py-3 last:border-0 dark:border-zinc-800">
            <div>
              <p className="font-mono text-sm">{feature.key}</p>
              <p className="mt-0.5 text-xs text-zinc-500">
                {feature.allowedEnvironments.length ? `Environments: ${feature.allowedEnvironments.join(", ")}` : "All environments"}
                {" · "}
                {feature.allowedRoles.length ? `Roles: ${feature.allowedRoles.join(", ")}` : "All authorized roles"}
              </p>
            </div>
            <button type="button" disabled={!canManage || busy === feature.key} onClick={() => void toggle(feature)} aria-pressed={feature.enabled} className={`rounded-full px-3 py-1 text-xs font-medium ${feature.enabled ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}>
              {feature.enabled ? "Enabled" : "Disabled"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
