"use client";

import { useAdmin } from "@/components/admin/context/AdminContext";
import { MetricCard } from "@/components/admin/ui/MetricCard";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { HealthStatusRow } from "@/components/admin/ui/PermissionGate";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import { cardClass } from "@/components/admin/ui/tokens";
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

  return (
    <div className="mx-auto max-w-7xl space-y-8" data-layout="sf-admin-dashboard">
      <PageHeader
        eyebrow={organization.name}
        title="Dashboard"
        description="Organization overview with control-plane health and recent activity."
      />

      <section aria-labelledby="metrics-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="metrics-heading" className="text-sm font-semibold text-[var(--text-heading)]">
            Telemetry strip
          </h2>
          <p className="text-xs text-[var(--text-muted)]">
            Environment: {selectedEnvironment}
          </p>
        </div>
        <div className="sf-telemetry-strip">
          {metrics.map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section
          className={`${cardClass} border-l-[3px] border-l-[var(--accent-primary)]`}
          aria-labelledby="health-heading"
        >
          <h2 id="health-heading" className="font-semibold text-[var(--text-heading)]">
            Service health topology
          </h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Real control-plane health for {selectedEnvironment}. Unknown stays unknown.
          </p>
          <div className="mt-4 divide-y divide-[var(--border-subtle)]">
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

        <section className={cardClass} aria-labelledby="activity-heading">
          <h2 id="activity-heading" className="font-semibold text-[var(--text-heading)]">
            Operational timeline
          </h2>
          {activity.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--text-muted)]">No audit events recorded yet.</p>
          ) : (
            <ol className="mt-4 max-h-72 space-y-2 overflow-y-auto scroll-thin">
              {activity.map((item) => (
                <li
                  key={item.id}
                  className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-operational)] p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-[var(--text-heading)]">{item.action}</span>
                    <StatusBadge status={item.outcome} />
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
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
