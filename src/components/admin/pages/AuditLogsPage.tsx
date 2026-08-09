"use client";

import { LiveStatus } from "@/components/atlas";
import { useAdmin } from "@/components/admin/context/AdminContext";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import { buttonPrimaryClass } from "@/components/admin/ui/tokens";
import type { EnterpriseAuditEvent } from "@/lib/enterprise/audit";

export function AuditLogsPage({ audit }: { audit: EnterpriseAuditEvent[] }) {
  const { organization } = useAdmin();

  return (
    <div
      className="mx-auto max-w-[var(--workbench-max)] space-y-5"
      data-layout="sf-forensic-stream"
    >
      <PageHeader
        eyebrow={organization.name}
        title="Audit Logs"
        description="Sanitized, append-only forensic trail for control-plane operations."
        actions={
          <div className="flex items-center gap-2">
            <LiveStatus label="Append-only" tone="amber" />
            <a className={buttonPrimaryClass} href="/api/admin/control-plane/export?kind=audit">
              Export audit
            </a>
          </div>
        }
      />
      <section className="rounded-[var(--radius-sm)] border border-[var(--atlas-line)] border-l-2 border-l-[var(--atlas-amber)] bg-[color-mix(in_srgb,var(--atlas-elevated)_90%,transparent)] p-3">
        <p className="atlas-micro-label text-[var(--atlas-amber)] mb-3">Forensic stream</p>
        <DataTable
          caption="Audit logs"
          data={audit}
          rowKey={(e) => e.id}
          pageSize={15}
          searchable
          searchFilter={(e, q) =>
            e.action.toLowerCase().includes(q) ||
            e.outcome.toLowerCase().includes(q) ||
            (e.resourceType ?? "").toLowerCase().includes(q)
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
              key: "resource",
              header: "Resource",
              render: (e) => (
                <span className="font-mono text-[10px] text-[var(--atlas-text-secondary)]">
                  {e.resourceType ?? "—"}
                </span>
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
          emptyTitle="No audit events"
        />
      </section>
    </div>
  );
}
