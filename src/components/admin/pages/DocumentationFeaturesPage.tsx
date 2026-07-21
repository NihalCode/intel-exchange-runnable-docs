"use client";

import { useEffect, useMemo, useState } from "react";

import { ADMIN_FEATURE_SECTIONS, DOCUMENTATION_FEATURE_LABELS } from "@/lib/documentation-features/keys";

type Feature = {
  key: string;
  enabled: boolean;
  effectiveEnabled?: boolean;
  autoEnabledByDeployment?: boolean;
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

  const byKey = useMemo(() => {
    const map = new Map<string, Feature>();
    for (const feature of features) map.set(feature.key, feature);
    return map;
  }, [features]);

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
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
        };
        setError(
          body.error ??
            (response.status === 403
              ? "Feature update was denied for your role or session."
              : "Feature update was rejected.")
        );
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Documentation features</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Only flags used by this docs / agent product are listed. Click a status
          chip to enable or disable. Multi-product deployment flags can show DB
          off while still being{" "}
          <span className="font-medium text-zinc-700 dark:text-zinc-200">effective</span>{" "}
          on pinned Vercel projects.
        </p>
      </div>
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      {ADMIN_FEATURE_SECTIONS.map((section) => (
        <section key={section.id} className="space-y-2">
          <div>
            <h2 className="text-sm font-semibold">{section.title}</h2>
            {section.description ? (
              <p className="text-xs text-zinc-500">{section.description}</p>
            ) : null}
          </div>
          <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
            {section.keys.map((key) => {
              const feature = byKey.get(key);
              if (!feature) return null;
              const effective = feature.effectiveEnabled ?? feature.enabled;
              return (
                <div
                  key={feature.key}
                  className="flex items-center justify-between gap-4 border-b border-zinc-200 px-4 py-3 last:border-0 dark:border-zinc-800"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {DOCUMENTATION_FEATURE_LABELS[
                        feature.key as keyof typeof DOCUMENTATION_FEATURE_LABELS
                      ] ?? feature.key}
                    </p>
                    <p className="font-mono text-xs text-zinc-500">{feature.key}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      DB: {feature.enabled ? "on" : "off"}
                      {" · "}
                      Effective: {effective ? "on" : "off"}
                      {feature.autoEnabledByDeployment
                        ? " · auto-enabled by deployment"
                        : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!canManage || busy === feature.key}
                    onClick={() => void toggle(feature)}
                    aria-pressed={feature.enabled}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      effective
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                    }`}
                  >
                    {effective ? "Enabled" : "Disabled"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
