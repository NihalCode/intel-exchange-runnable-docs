"use client";

import { useMemo } from "react";

import { LiveStatus } from "@/components/atlas";
import { useAdmin } from "@/components/admin/context/AdminContext";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import type { ChangeRequestRecord } from "@/lib/enterprise/types";
import type {
  ConfigVersionRecord,
  ControlPlaneResourceRecord,
} from "@/lib/enterprise/repository";

type Resource = ControlPlaneResourceRecord & { versions: ConfigVersionRecord[] };

export function ChangeRequestsPage({
  changes,
  resources,
}: {
  changes: ChangeRequestRecord[];
  resources: Resource[];
}) {
  const { organization, selectedEnvironment } = useAdmin();

  const envChanges = useMemo(
    () =>
      changes.filter((change) => {
        const resource = resources.find((r) => r.id === change.resourceId);
        return resource?.environment === selectedEnvironment;
      }),
    [changes, resources, selectedEnvironment]
  );

  return (
    <div
      className="mx-auto max-w-[var(--workbench-max)] space-y-5"
      data-layout="sf-change-pipeline"
    >
      <PageHeader
        eyebrow={organization.name}
        title="Change Requests"
        description="Organization-wide configuration change workflow for the selected plane."
        actions={<LiveStatus label={selectedEnvironment} tone="signal" />}
      />
      <section className="rounded-[var(--radius-sm)] border border-[var(--atlas-line)] bg-[color-mix(in_srgb,var(--atlas-elevated)_90%,transparent)] p-3">
        <p className="atlas-micro-label text-[var(--atlas-violet)] mb-3">Workflow stream</p>
        <DataTable
          caption="Change requests"
          data={envChanges}
          rowKey={(c) => c.id}
          searchable
          searchFilter={(c, q) => c.state.toLowerCase().includes(q) || c.id.includes(q)}
          columns={[
            {
              key: "id",
              header: "ID",
              render: (c) => (
                <span className="font-mono text-xs text-[var(--atlas-text)]">
                  {c.id.slice(0, 12)}
                </span>
              ),
            },
            {
              key: "state",
              header: "Status",
              sortable: true,
              sortValue: (c) => c.state,
              render: (c) => <StatusBadge status={c.state} />,
            },
            {
              key: "updated",
              header: "Updated",
              sortable: true,
              sortValue: (c) => c.updatedAt,
              render: (c) => (
                <time
                  className="font-mono text-[10px] text-[var(--atlas-text-muted)]"
                  dateTime={c.updatedAt}
                >
                  {new Date(c.updatedAt).toLocaleString()}
                </time>
              ),
            },
          ]}
          emptyTitle="No change requests"
        />
      </section>
    </div>
  );
}
