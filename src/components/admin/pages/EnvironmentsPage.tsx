"use client";

import { useMemo } from "react";

import { LiveStatus, TelemetryValue } from "@/components/atlas";
import { useAdmin } from "@/components/admin/context/AdminContext";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import type {
  ConfigVersionRecord,
  ControlPlaneResourceRecord,
} from "@/lib/enterprise/repository";

type Resource = ControlPlaneResourceRecord & { versions: ConfigVersionRecord[] };

export function EnvironmentsPage({ resources }: { resources: Resource[] }) {
  const { organization, selectedEnvironment } = useAdmin();

  const grouped = useMemo(
    () =>
      (["development", "staging", "production"] as const).map((environment) => ({
        environment,
        resources: resources.filter((r) => r.environment === environment),
      })),
    [resources]
  );

  return (
    <div
      className="mx-auto max-w-[var(--workbench-max)] space-y-5"
      data-layout="sf-env-topology"
    >
      <PageHeader
        eyebrow={organization.name}
        title="Environments"
        description="Documentation Agent resources grouped by deployment plane."
        actions={<LiveStatus label={selectedEnvironment} tone="signal" />}
      />
      <div className="grid gap-3 md:grid-cols-3">
        {grouped.map((group) => {
          const active = group.environment === selectedEnvironment;
          return (
            <section
              key={group.environment}
              className={`rounded-[var(--radius-sm)] border bg-[color-mix(in_srgb,var(--atlas-elevated)_90%,transparent)] p-4 ${
                active
                  ? "border-[var(--atlas-line-strong)] border-l-2 border-l-[var(--atlas-signal)]"
                  : "border-[var(--atlas-line)]"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="atlas-micro-label text-[var(--atlas-signal)]">
                  {group.environment}
                </p>
                <StatusBadge status={group.resources.length ? "active" : "disabled"} />
              </div>
              <div className="mt-3">
                <TelemetryValue label="Resources" value={group.resources.length} />
              </div>
              <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto border-t border-[var(--atlas-line)] pt-3 text-sm">
                {group.resources.length === 0 ? (
                  <li className="text-[var(--atlas-text-muted)]">No resources</li>
                ) : (
                  group.resources.map((r) => (
                    <li key={r.id} className="font-mono text-xs text-[var(--atlas-text)]">
                      {r.name}
                    </li>
                  ))
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
