"use client";

import Link from "next/link";

import { useAdmin } from "@/components/admin/context/AdminContext";
import { MetricCard } from "@/components/admin/ui/MetricCard";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { cardClass, linkClass } from "@/components/admin/ui/tokens";
import { MOCK_SUPPORT_ANALYTICS, PLACEHOLDER_NOTICE } from "@/lib/admin/mock-data";

export function SupportAgentOverviewPage() {
  const { organization } = useAdmin();

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        eyebrow={organization.name}
        title="Support Agent"
        description="Preview surface for support automation. Not production-ready unless real Zendesk workflows are connected and validated."
        actions={
          <span
            className="rounded-[var(--radius-md)] border border-amber-300 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
            data-testid="support-agent-mock-badge"
          >
            Mock — not live
          </span>
        }
      />
      <p
        className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
        role="status"
        data-testid="support-agent-placeholder"
      >
        {PLACEHOLDER_NOTICE}
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="Resolution rate"
          value={`${MOCK_SUPPORT_ANALYTICS.resolutionRate}%`}
          trend="up"
          change="+3%"
          sparkline={MOCK_SUPPORT_ANALYTICS.volumeTrend}
        />
        <MetricCard
          label="Avg response"
          value={`${MOCK_SUPPORT_ANALYTICS.avgResponseMin} min`}
          trend="down"
          change="−0.4 min"
        />
        <MetricCard
          label="Satisfaction"
          value={String(MOCK_SUPPORT_ANALYTICS.satisfaction)}
          trend="up"
          change="+0.1"
        />
      </div>

      <section className={cardClass}>
        <h2 className="font-semibold">Quick links</h2>
        <ul className="mt-3 flex flex-wrap gap-3">
          {[
            "/admin/support-agent/integrations",
            "/admin/support-agent/channels",
            "/admin/support-agent/responses",
            "/admin/support-agent/analytics",
            "/admin/support-agent/settings",
          ].map((href) => (
            <li key={href}>
              <Link href={href} className={linkClass}>
                {href.split("/").pop()?.replace("-", " ")}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
