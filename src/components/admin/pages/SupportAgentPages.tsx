"use client";

import { useAdmin } from "@/components/admin/context/AdminContext";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import { RiskBadge } from "@/components/admin/ui/RiskBadge";
import { MethodBadge } from "@/components/admin/ui/PermissionGate";
import {
  MOCK_AGENT_ACTIONS,
  MOCK_ESCALATION_RULES,
  MOCK_SUPPORT_ANALYTICS,
  MOCK_SUPPORT_API_ENDPOINTS,
  MOCK_SUPPORT_API_KEYS,
  MOCK_SUPPORT_CHANNELS,
  MOCK_SUPPORT_DOMAINS,
  MOCK_SUPPORT_INTEGRATIONS,
  MOCK_SUPPORT_LOGS,
  MOCK_SUPPORT_RESPONSES,
  MOCK_SUPPORT_WEBHOOKS,
  PLACEHOLDER_NOTICE,
} from "@/lib/admin/mock-data";

function PlaceholderNotice() {
  return (
    <p
      className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
      role="status"
      data-testid="support-agent-placeholder"
    >
      <span className="mr-2 inline-block rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-950 dark:bg-amber-900 dark:text-amber-50">
        Mock — not live
      </span>
      {PLACEHOLDER_NOTICE}
    </p>
  );
}

export function SupportAgentApisPage() {
  const { organization, selectedEnvironment } = useAdmin();
  const rows = MOCK_SUPPORT_API_ENDPOINTS.filter(
    (e) => e.environment === selectedEnvironment
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow={organization.name}
        title="API Endpoints"
        description="Support Agent HTTP endpoints by environment."
      />
      <PlaceholderNotice />
      <DataTable
        caption="API endpoints"
        data={rows}
        rowKey={(e) => e.id}
        emptyTitle="No API endpoints configured"
        emptyDescription="Create an endpoint to expose an approved support agent capability."
        columns={[
          { key: "name", header: "Name", sortable: true, sortValue: (e) => e.name, render: (e) => e.name },
          { key: "method", header: "Method", render: (e) => <MethodBadge method={e.method} /> },
          { key: "route", header: "Route", render: (e) => <span className="font-mono text-xs">{e.route}</span> },
          { key: "status", header: "Status", render: (e) => <StatusBadge status={e.status} /> },
          { key: "health", header: "Health", render: (e) => <StatusBadge status={e.health} /> },
        ]}
      />
    </div>
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

export function SupportAgentActionsPage() {
  const { organization, selectedEnvironment } = useAdmin();
  const rows = MOCK_AGENT_ACTIONS.filter((a) => a.environment === selectedEnvironment);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow={organization.name}
        title="Agent Actions"
        description="Policy-controlled actions the Support Agent may execute."
      />
      <PlaceholderNotice />
      <DataTable
        caption="Agent actions"
        data={rows}
        rowKey={(a) => a.id}
        emptyTitle="No agent actions configured"
        emptyDescription="Define action policies to control what the Support Agent can do."
        columns={[
          { key: "name", header: "Action", sortable: true, sortValue: (a) => a.name, render: (a) => a.name },
          { key: "category", header: "Category", render: (a) => a.category },
          { key: "risk", header: "Risk", render: (a) => <RiskBadge level={a.risk} /> },
          { key: "enabled", header: "Enabled", render: (a) => <StatusBadge status={a.enabled ? "active" : "disabled"} /> },
          {
            key: "approval",
            header: "Approval",
            render: (a) =>
              a.approvalRequired ? (
                <span className="text-xs text-amber-700 dark:text-amber-300">Human approval required</span>
              ) : (
                "—"
              ),
          },
        ]}
      />
    </div>
  );
}

export function SupportAgentEscalationPage() {
  const { organization } = useAdmin();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow={organization.name}
        title="Escalation"
        description="Human handoff and escalation rules."
      />
      <PlaceholderNotice />
      <DataTable
        caption="Escalation rules"
        data={MOCK_ESCALATION_RULES}
        rowKey={(r) => r.id}
        emptyTitle="No escalation rules"
        emptyDescription="Create rules to route conversations to human agents when triggers match."
        columns={[
          { key: "name", header: "Rule", sortable: true, sortValue: (r) => r.name, render: (r) => r.name },
          { key: "trigger", header: "Trigger", render: (r) => r.trigger },
          { key: "destination", header: "Destination", render: (r) => r.destination },
          { key: "priority", header: "Priority", render: (r) => <StatusBadge status={r.priority} /> },
          { key: "enabled", header: "Status", render: (r) => <StatusBadge status={r.enabled ? "active" : "disabled"} /> },
          { key: "last", header: "Last triggered", render: (r) => r.lastTriggered ?? "—" },
        ]}
      />
    </div>
  );
}

export function SupportAgentKeysPage() {
  const { organization, selectedEnvironment } = useAdmin();
  const rows = MOCK_SUPPORT_API_KEYS.filter((k) => k.environment === selectedEnvironment);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow={organization.name}
        title="API Keys"
        description="Support Agent API credentials."
      />
      <PlaceholderNotice />
      <DataTable
        caption="API keys"
        data={rows}
        rowKey={(k) => k.id}
        emptyTitle="No API keys"
        emptyDescription="Create an API key for programmatic access to the Support Agent."
        columns={[
          { key: "name", header: "Name", render: (k) => k.name },
          { key: "prefix", header: "Prefix", render: (k) => <span className="font-mono text-xs">{k.prefix}</span> },
          { key: "status", header: "Status", render: (k) => <StatusBadge status={k.status} /> },
          { key: "lastUsed", header: "Last used", render: (k) => k.lastUsed ?? "—" },
        ]}
      />
    </div>
  );
}

export function SupportAgentDomainsPage() {
  const { organization, selectedEnvironment } = useAdmin();
  const rows = MOCK_SUPPORT_DOMAINS.filter((d) => d.environment === selectedEnvironment);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow={organization.name}
        title="Domains"
        description="Custom domains for Support Agent endpoints."
      />
      <PlaceholderNotice />
      <DataTable
        caption="Domains"
        data={rows}
        rowKey={(d) => d.id}
        emptyTitle="No custom domains"
        emptyDescription="Add a domain to serve Support Agent traffic on your own hostname."
        columns={[
          { key: "domain", header: "Domain", render: (d) => d.domain },
          { key: "dns", header: "DNS", render: (d) => <StatusBadge status={d.dnsStatus} /> },
          { key: "ssl", header: "SSL", render: (d) => <StatusBadge status={d.sslStatus} /> },
          { key: "primary", header: "Primary", render: (d) => (d.primary ? "Yes" : "—") },
        ]}
      />
    </div>
  );
}

export function SupportAgentWebhooksPage() {
  const { organization, selectedEnvironment } = useAdmin();
  const rows = MOCK_SUPPORT_WEBHOOKS.filter((w) => w.environment === selectedEnvironment);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow={organization.name}
        title="Webhooks"
        description="Outbound webhook subscriptions for Support Agent events."
      />
      <PlaceholderNotice />
      <DataTable
        caption="Webhooks"
        data={rows}
        rowKey={(w) => w.id}
        emptyTitle="No webhooks configured"
        emptyDescription="Subscribe to Support Agent events for external automation."
        columns={[
          { key: "url", header: "Destination", render: (w) => <span className="font-mono text-xs">{w.url}</span> },
          { key: "events", header: "Events", render: (w) => w.events.join(", ") },
          { key: "status", header: "Status", render: (w) => <StatusBadge status={w.status} /> },
        ]}
      />
    </div>
  );
}

export function SupportAgentLogsPage() {
  const { organization, selectedEnvironment } = useAdmin();
  const rows = MOCK_SUPPORT_LOGS.filter((l) => l.environment === selectedEnvironment);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow={organization.name}
        title="Logs"
        description="Support Agent API request logs."
      />
      <PlaceholderNotice />
      <DataTable
        caption="Request logs"
        data={rows}
        rowKey={(l) => l.id}
        emptyTitle="No request logs"
        emptyDescription="Request logs will appear here once the Support Agent API is active."
        columns={[
          { key: "time", header: "Time", sortable: true, sortValue: (l) => l.timestamp, render: (l) => l.timestamp },
          { key: "requestId", header: "Request ID", render: (l) => <span className="font-mono text-xs">{l.requestId}</span> },
          { key: "endpoint", header: "Endpoint", render: (l) => l.endpoint },
          { key: "method", header: "Method", render: (l) => <MethodBadge method={l.method as "GET" | "POST"} /> },
          { key: "status", header: "Status", render: (l) => l.status },
          { key: "duration", header: "Duration", render: (l) => `${l.durationMs} ms` },
        ]}
      />
    </div>
  );
}

/** @deprecated Redirect route — kept for backwards compatibility */
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
