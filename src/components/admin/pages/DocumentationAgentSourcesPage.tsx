"use client";

import { useAdmin, useEnvironmentFilter } from "@/components/admin/context/AdminContext";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import { MOCK_DOC_SOURCES, PLACEHOLDER_NOTICE } from "@/lib/admin/mock-data";

export function DocumentationAgentSourcesPage() {
  const { organization } = useAdmin();
  const sources = useEnvironmentFilter(MOCK_DOC_SOURCES);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow={organization.name}
        title="Sources"
        description="Documentation ingestion sources and sync status."
      />
      <p className="text-xs text-amber-700 dark:text-amber-300">{PLACEHOLDER_NOTICE}</p>
      <DataTable
        caption="Documentation sources"
        data={sources}
        rowKey={(s) => s.id}
        searchable
        searchFilter={(s, q) =>
          s.name.toLowerCase().includes(q) || s.type.toLowerCase().includes(q)
        }
        columns={[
          { key: "name", header: "Name", sortable: true, sortValue: (s) => s.name, render: (s) => s.name },
          { key: "type", header: "Type", render: (s) => s.type },
          {
            key: "status",
            header: "Status",
            render: (s) => <StatusBadge status={s.status} />,
          },
          {
            key: "lastSync",
            header: "Last sync",
            sortable: true,
            sortValue: (s) => s.lastSync,
            render: (s) => s.lastSync,
          },
        ]}
        emptyTitle="No sources configured"
      />
    </div>
  );
}
