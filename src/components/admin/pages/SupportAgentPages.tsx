"use client";

import { useAdmin } from "@/components/admin/context/AdminContext";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import {
  MOCK_SUPPORT_ANALYTICS,
  MOCK_SUPPORT_CHANNELS,
  MOCK_SUPPORT_INTEGRATIONS,
  MOCK_SUPPORT_RESPONSES,
  PLACEHOLDER_NOTICE,
} from "@/lib/admin/mock-data";

function PlaceholderNotice() {
  return (
    <p className="text-xs text-amber-700 dark:text-amber-300">{PLACEHOLDER_NOTICE}</p>
  );
}

export function SupportAgentIntegrationsPage() {
  const { organization } = useAdmin();
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader eyebrow={organization.name} title="Integrations" description="Third-party support integrations." />
      <PlaceholderNotice />
      <DataTable
        caption="Integrations"
        data={MOCK_SUPPORT_INTEGRATIONS}
        rowKey={(i) => i.id}
        columns={[
          { key: "name", header: "Name", sortable: true, sortValue: (i) => i.name, render: (i) => i.name },
          { key: "category", header: "Category", render: (i) => i.category },
          { key: "status", header: "Status", render: (i) => <StatusBadge status={i.status} /> },
          { key: "lastSync", header: "Last sync", render: (i) => i.lastSync },
        ]}
      />
    </div>
  );
}

export function SupportAgentChannelsPage() {
  const { organization } = useAdmin();
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader eyebrow={organization.name} title="Channels" description="Inbound support channels." />
      <PlaceholderNotice />
      <DataTable
        caption="Channels"
        data={MOCK_SUPPORT_CHANNELS}
        rowKey={(c) => c.id}
        columns={[
          { key: "name", header: "Name", render: (c) => c.name },
          { key: "type", header: "Type", render: (c) => c.type },
          { key: "status", header: "Status", render: (c) => <StatusBadge status={c.status} /> },
          { key: "volume", header: "24h volume", render: (c) => c.volume24h },
        ]}
      />
    </div>
  );
}

export function SupportAgentResponsesPage() {
  const { organization } = useAdmin();
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader eyebrow={organization.name} title="Responses" description="Canned response templates." />
      <PlaceholderNotice />
      <DataTable
        caption="Responses"
        data={MOCK_SUPPORT_RESPONSES}
        rowKey={(r) => r.id}
        columns={[
          { key: "title", header: "Title", sortable: true, sortValue: (r) => r.title, render: (r) => r.title },
          { key: "category", header: "Category", render: (r) => r.category },
          { key: "usage", header: "Usage", sortable: true, sortValue: (r) => r.usageCount, render: (r) => r.usageCount },
        ]}
      />
    </div>
  );
}

export function SupportAgentAnalyticsPage() {
  const { organization } = useAdmin();
  const { volumeTrend } = MOCK_SUPPORT_ANALYTICS;
  const max = Math.max(...volumeTrend, 1);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader eyebrow={organization.name} title="Analytics" description="Support volume trends." />
      <PlaceholderNotice />
      <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Volume (12 periods)</h2>
        <div className="mt-4 flex h-32 items-end gap-1">
          {volumeTrend.map((v, i) => (
            <div
              key={i}
              className="flex-1 rounded-t bg-sky-600 dark:bg-sky-500"
              style={{ height: `${(v / max) * 100}%` }}
              title={String(v)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function SupportAgentSettingsPage() {
  const { organization } = useAdmin();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader eyebrow={organization.name} title="Settings" description="Support Agent configuration." />
      <PlaceholderNotice />
      <p className="rounded-md border border-zinc-200 px-4 py-6 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
        Support Agent settings backend is not yet connected. Configuration forms will appear here.
      </p>
    </div>
  );
}
