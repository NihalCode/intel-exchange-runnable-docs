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
    <div className="mx-auto max-w-7xl space-y-8">
      <PageHeader
        eyebrow={organization.name}
        title="Dashboard"
        description="Organization overview with control-plane health and recent activity."
      />

      <section aria-labelledby="metrics-heading">
        <h2 id="metrics-heading" className="sr-only">
          Key metrics
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={cardClass} aria-labelledby="health-heading">
          <h2 id="health-heading" className="font-semibold">
            Service health
          </h2>
          <p className="mt-1 text-xs text-zinc-500">Environment: {selectedEnvironment}</p>
          <div className="mt-4 divide-y divide-zinc-200 dark:divide-zinc-800">
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
          <h2 id="activity-heading" className="font-semibold">
            Activity feed
          </h2>
          {activity.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">No audit events recorded yet.</p>
          ) : (
            <ol className="mt-4 max-h-72 space-y-2 overflow-y-auto">
              {activity.map((item) => (
                <li
                  key={item.id}
                  className="rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{item.action}</span>
                    <StatusBadge status={item.outcome} />
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
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
