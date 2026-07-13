"use client";

import { useAdmin } from "@/components/admin/context/AdminContext";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import type { EnterpriseAuditEvent } from "@/lib/enterprise/audit";

export function DocumentationAgentLogsPage({ audit }: { audit: EnterpriseAuditEvent[] }) {
  const { organization } = useAdmin();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow={organization.name}
        title="Logs"
        description="Sanitized audit trail for Documentation Agent control-plane operations."
      />
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
            render: (e) => e.action,
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
        emptyTitle="No log entries"
      />
    </div>
  );
}
