"use client";

import { useAdmin } from "@/components/admin/context/AdminContext";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import { buttonPrimaryClass } from "@/components/admin/ui/tokens";
import type { EnterpriseAuditEvent } from "@/lib/enterprise/audit";

export function AuditLogsPage({ audit }: { audit: EnterpriseAuditEvent[] }) {
  const { organization } = useAdmin();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow={organization.name}
        title="Audit Logs"
        description="Sanitized, append-only audit trail for control-plane operations."
        actions={
          <a className={buttonPrimaryClass} href="/api/admin/control-plane/export?kind=audit">
            Export audit
          </a>
        }
      />
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
            render: (e) => e.action,
          },
          {
            key: "resource",
            header: "Resource",
            render: (e) => e.resourceType ?? "—",
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
              <time dateTime={e.createdAt}>{new Date(e.createdAt).toLocaleString()}</time>
            ),
          },
        ]}
        emptyTitle="No audit events"
      />
    </div>
  );
}
