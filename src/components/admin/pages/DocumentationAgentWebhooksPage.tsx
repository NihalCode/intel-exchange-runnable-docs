"use client";

import { useAdmin, useEnvironmentFilter } from "@/components/admin/context/AdminContext";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import { MOCK_WEBHOOKS, PLACEHOLDER_NOTICE } from "@/lib/admin/mock-data";

export function DocumentationAgentWebhooksPage() {
  const { organization } = useAdmin();
  const webhooks = useEnvironmentFilter(MOCK_WEBHOOKS);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow={organization.name}
        title="Webhooks"
        description="Outbound webhook subscriptions for Documentation Agent events."
      />
      <p className="text-xs text-amber-700 dark:text-amber-300">{PLACEHOLDER_NOTICE}</p>
      <DataTable
        caption="Webhooks"
        data={webhooks}
        rowKey={(w) => w.id}
        columns={[
          { key: "url", header: "URL", render: (w) => <span className="font-mono text-xs">{w.url}</span> },
          { key: "events", header: "Events", render: (w) => w.events.join(", ") },
          { key: "status", header: "Status", render: (w) => <StatusBadge status={w.status} /> },
        ]}
        emptyTitle="No webhooks"
      />
    </div>
  );
}
