"use client";

import { LiveStatus } from "@/components/atlas";
import { useAdmin } from "@/components/admin/context/AdminContext";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import type { EnterpriseAuditEvent } from "@/lib/enterprise/audit";

export function DocumentationAgentLogsPage({ audit }: { audit: EnterpriseAuditEvent[] }) {
  const { organization } = useAdmin();

  return (
    <div
      className="mx-auto max-w-[var(--workbench-max)] space-y-5"
      data-layout="sf-forensic-stream"
    >
      <PageHeader
        eyebrow={organization.name}
        title="Logs"
        description="Sanitized audit trail for Documentation Agent control-plane operations."
        actions={<LiveStatus label="Stream" tone="amber" />}
      />
      <section className="rounded-[var(--radius-sm)] border border-[var(--atlas-line)] border-l-2 border-l-[var(--atlas-amber)] bg-[color-mix(in_srgb,var(--atlas-elevated)_90%,transparent)] p-3">
        <p className="atlas-micro-label text-[var(--atlas-amber)] mb-3">Event continuum</p>
        <DataTable
          caption="Audit logs"
          data={audit}
          rowKey={(e) => e.id}
          searchable
          searchFilter={(e, q) =>
            e.action.toLowerCase().includes(q) || e.outcome.toLowerCase().includes(q)
          }
          columns={[
            {
              key: "action",
              header: "Action",
              sortable: true,
              sortValue: (e) => e.action,
              render: (e) => (
                <span className="font-medium text-[var(--atlas-text)]">{e.action}</span>
              ),
            },
            {
              key: "outcome",
              header: "Outcome",
              render: (e) => <StatusBadge status={e.outcome} />,
            },
            {
              key: "created",
              header: "Time",
              sortable: true,
              sortValue: (e) => e.createdAt,
              render: (e) => (
                <time
                  className="font-mono text-[10px] text-[var(--atlas-text-muted)]"
                  dateTime={e.createdAt}
                >
                  {new Date(e.createdAt).toLocaleString()}
                </time>
              ),
            },
          ]}
          emptyTitle="No log entries"
        />
      </section>
    </div>
  );
}
