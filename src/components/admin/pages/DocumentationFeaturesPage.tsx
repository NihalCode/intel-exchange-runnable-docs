"use client";

import { useEffect, useMemo, useState } from "react";

import { LiveStatus } from "@/components/atlas";
import { PageHeader } from "@/components/admin/ui/PageHeader";
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
    <div
      className="mx-auto max-w-[var(--workbench-max)] space-y-5"
      data-layout="sf-capability-matrix"
    >
      <PageHeader
        eyebrow="Capabilities"
        title="Documentation features"
        description="Only flags used by this docs / agent product are listed. Click a status chip to enable or disable. Multi-product deployment flags can show DB off while still being effective on pinned Vercel projects."
        actions={<LiveStatus label={canManage ? "Editable" : "Read-only"} tone="signal" />}
      />
      {error ? (
        <p className="rounded-[var(--radius-sm)] border border-[var(--atlas-danger)] bg-[color-mix(in_srgb,var(--atlas-danger)_10%,transparent)] px-3 py-2 text-sm text-[var(--atlas-danger)]" role="alert">
          {error}
        </p>
      ) : null}

      {ADMIN_FEATURE_SECTIONS.map((section) => (
        <section
          key={section.id}
          className="rounded-[var(--radius-sm)] border border-[var(--atlas-line)] bg-[color-mix(in_srgb,var(--atlas-elevated)_90%,transparent)]"
        >
          <div className="border-b border-[var(--atlas-line)] px-4 py-3">
            <p className="atlas-micro-label text-[var(--atlas-violet)]">{section.id}</p>
            <h2 className="mt-1 text-sm font-semibold text-[var(--atlas-text)]">{section.title}</h2>
            {section.description ? (
              <p className="mt-1 text-xs text-[var(--atlas-text-muted)]">{section.description}</p>
            ) : null}
          </div>
          <div className="divide-y divide-[var(--atlas-line)]">
            {section.keys.map((key) => {
              const feature = byKey.get(key);
              if (!feature) return null;
              const effective = feature.effectiveEnabled ?? feature.enabled;
              return (
                <div
                  key={feature.key}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--atlas-text)]">
                      {DOCUMENTATION_FEATURE_LABELS[
                        feature.key as keyof typeof DOCUMENTATION_FEATURE_LABELS
                      ] ?? feature.key}
                    </p>
                    <p className="font-mono text-[10px] text-[var(--atlas-text-muted)]">
                      {feature.key}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] text-[var(--atlas-text-secondary)]">
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
                    className={`rounded-[var(--radius-sm)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50 ${
                      effective
                        ? "border border-[var(--atlas-line-strong)] bg-[color-mix(in_srgb,var(--atlas-signal)_14%,transparent)] text-[var(--atlas-signal)]"
                        : "border border-[var(--atlas-line)] bg-[var(--surface-operational)] text-[var(--atlas-text-muted)]"
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
