"use client";

import { useMemo } from "react";

import { useAdmin } from "@/components/admin/context/AdminContext";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import { cardClass } from "@/components/admin/ui/tokens";
import type {
  ConfigVersionRecord,
  ControlPlaneResourceRecord,
} from "@/lib/enterprise/repository";

type Resource = ControlPlaneResourceRecord & { versions: ConfigVersionRecord[] };

export function EnvironmentsPage({ resources }: { resources: Resource[] }) {
  const { organization } = useAdmin();

  const grouped = useMemo(
    () =>
      (["development", "staging", "production"] as const).map((environment) => ({
        environment,
        resources: resources.filter((r) => r.environment === environment),
      })),
    [resources]
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow={organization.name}
        title="Environments"
        description="Documentation Agent resources grouped by deployment environment."
      />
      <div className="grid gap-4 md:grid-cols-3">
        {grouped.map((group) => (
          <section key={group.environment} className={cardClass}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold capitalize">{group.environment}</h2>
              <StatusBadge status={group.resources.length ? "active" : "disabled"} />
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{group.resources.length}</p>
            <p className="text-sm text-zinc-500">resources</p>
            <ul className="mt-3 space-y-1 text-sm">
              {group.resources.map((r) => (
                <li key={r.id}>{r.name}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
