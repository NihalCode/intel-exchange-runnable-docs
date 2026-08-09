"use client";

import { LiveStatus, TelemetryValue } from "@/components/atlas";
import { useAdmin } from "@/components/admin/context/AdminContext";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { HealthStatusRow } from "@/components/admin/ui/PermissionGate";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import type {
  OverviewActivityItem,
  OverviewHealthService,
  OverviewMetric,
} from "@/lib/admin/overview-data";

interface Props {
  metrics: OverviewMetric[];
  health: OverviewHealthService[];
  activity: OverviewActivityItem[];
}

export function AdminOverviewPage({ metrics, health, activity }: Props) {
  const { organization, selectedEnvironment } = useAdmin();
  const lead = metrics[0];
  const rest = metrics.slice(1);

  return (
    <div className="mx-auto max-w-7xl space-y-6" data-layout="sf-admin-dashboard">
      <PageHeader
        eyebrow={organization.name}
        title="Admin overview"
        description="Organization health, recent activity, and shortcuts into admin tools."
        actions={<LiveStatus label={selectedEnvironment} tone="signal" />}
      />

      <section
        className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)]"
        aria-labelledby="metrics-heading"
      >
        <div className="rounded-[var(--radius-sm)] border border-[var(--atlas-line)] bg-[color-mix(in_srgb,var(--atlas-elevated)_90%,transparent)] p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 id="metrics-heading" className="atlas-micro-label text-[var(--atlas-signal)]">
              Key metrics
            </h2>
            <p className="atlas-micro-label !inline">{selectedEnvironment}</p>
          </div>
          {lead ? (
            <TelemetryValue label={lead.label} value={lead.value} />
          ) : (
            <p className="text-sm text-[var(--atlas-text-muted)]">No metrics yet.</p>
          )}
          {lead?.change ? (
            <p className="mt-2 font-mono text-[11px] text-[var(--atlas-text-secondary)]">
              {lead.change}
            </p>
          ) : null}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {rest.map((metric) => (
            <div
              key={metric.label}
              className="rounded-[var(--radius-sm)] border border-[var(--atlas-line)] bg-[var(--surface-operational)] px-3 py-2.5"
            >
              <TelemetryValue label={metric.label} value={metric.value} />
              {metric.change ? (
                <p className="mt-1 font-mono text-[10px] text-[var(--atlas-text-muted)]">
                  {metric.change}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section
          className="rounded-[var(--radius-sm)] border border-[var(--atlas-line)] border-l-2 border-l-[var(--atlas-signal)] bg-[color-mix(in_srgb,var(--atlas-elevated)_88%,transparent)] p-4"
          aria-labelledby="health-heading"
        >
          <h2 id="health-heading" className="text-sm font-semibold text-[var(--atlas-text)]">
            Service health topology
          </h2>
          <p className="mt-1 text-xs text-[var(--atlas-text-muted)]">
            Real control-plane health for {selectedEnvironment}. Unknown stays unknown.
          </p>
          <div className="mt-3 divide-y divide-[var(--atlas-line)]">
            {health.map((service) => (
              <HealthStatusRow
                key={service.name}
                name={service.name}
                status={service.status}
                latencyMs={service.latencyMs ?? undefined}
              />
            ))}
          </div>
        </section>

        <section
          className="rounded-[var(--radius-sm)] border border-[var(--atlas-line)] bg-[color-mix(in_srgb,var(--atlas-elevated)_88%,transparent)] p-4"
          aria-labelledby="activity-heading"
        >
          <h2 id="activity-heading" className="text-sm font-semibold text-[var(--atlas-text)]">
            Operational timeline
          </h2>
          {activity.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--atlas-text-muted)]">No audit events recorded yet.</p>
          ) : (
            <ol className="mt-3 max-h-80 space-y-0 overflow-y-auto scroll-thin border-l border-[var(--atlas-line)] pl-3">
              {activity.map((item) => (
                <li key={item.id} className="relative py-2.5 pl-1 text-sm">
                  <span
                    className="absolute -left-[0.97rem] top-3.5 h-1.5 w-1.5 rounded-full bg-[var(--atlas-signal)]"
                    aria-hidden="true"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-[var(--atlas-text)]">{item.action}</span>
                    <StatusBadge status={item.outcome} />
                  </div>
                  <p className="mt-1 font-mono text-[10px] text-[var(--atlas-text-muted)]">
                    {item.actor} ·{" "}
                    <time dateTime={item.timestamp}>
                      {new Date(item.timestamp).toLocaleString()}
                    </time>
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
