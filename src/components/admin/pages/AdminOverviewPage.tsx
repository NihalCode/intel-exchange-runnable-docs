"use client";

import { useAdmin } from "@/components/admin/context/AdminContext";
import { MetricCard } from "@/components/admin/ui/MetricCard";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { HealthStatusRow } from "@/components/admin/ui/PermissionGate";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import { cardClass } from "@/components/admin/ui/tokens";
import {
  MOCK_HEALTH_SERVICES,
  MOCK_OVERVIEW_METRICS,
  mockActivityFeed,
  PLACEHOLDER_NOTICE,
} from "@/lib/admin/mock-data";
import type { EnterpriseAuditEvent } from "@/lib/enterprise/audit";

interface Props {
  audit: EnterpriseAuditEvent[];
}

export function AdminOverviewPage({ audit }: Props) {
  const { organization, selectedEnvironment } = useAdmin();
  const mockActivity = mockActivityFeed();

  const realActivity = audit.slice(0, 8).map((event) => ({
    id: event.id,
    action: event.action,
    actor: event.actorUserId ?? "system",
    outcome: event.outcome,
    timestamp: event.createdAt,
    placeholder: false,
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <PageHeader
        eyebrow={organization.name}
        title="Dashboard"
        description="Organization overview with control-plane health and recent activity."
      />

      <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
        {PLACEHOLDER_NOTICE} Metrics and support-agent health are illustrative.
      </p>

      <section aria-labelledby="metrics-heading">
        <h2 id="metrics-heading" className="sr-only">
          Key metrics
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {MOCK_OVERVIEW_METRICS.map((metric) => (
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
            {MOCK_HEALTH_SERVICES.map((service) => (
              <HealthStatusRow
                key={service.name}
                name={service.name}
                status={service.status}
                latencyMs={service.latencyMs}
              />
            ))}
          </div>
        </section>

        <section className={cardClass} aria-labelledby="activity-heading">
          <h2 id="activity-heading" className="font-semibold">
            Activity feed
          </h2>
          <ol className="mt-4 max-h-72 space-y-2 overflow-y-auto">
            {[...realActivity, ...mockActivity].slice(0, 12).map((item) => (
              <li
                key={item.id}
                className="rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{item.action}</span>
                  {"outcome" in item ? <StatusBadge status={item.outcome} /> : null}
                  {"placeholder" in item && item.placeholder ? (
                    <span className="text-xs text-amber-700 dark:text-amber-300">mock</span>
                  ) : null}
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
        </section>
      </div>
    </div>
  );
}
