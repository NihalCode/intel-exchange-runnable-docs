"use client";

import { useAdmin, useEnvironmentFilter } from "@/components/admin/context/AdminContext";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { MOCK_RATE_LIMITS, PLACEHOLDER_NOTICE } from "@/lib/admin/mock-data";

export function RateLimitsPage() {
  const { organization } = useAdmin();
  const limits = useEnvironmentFilter(MOCK_RATE_LIMITS);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow={organization.name}
        title="Rate Limits"
        description="API and mutation rate limits by environment."
      />
      <p className="text-xs text-amber-700 dark:text-amber-300">{PLACEHOLDER_NOTICE}</p>
      <DataTable
        caption="Rate limits"
        data={limits}
        rowKey={(r) => r.id}
        columns={[
          { key: "name", header: "Name", render: (r) => r.name },
          { key: "limit", header: "Limit", render: (r) => `${r.limit} / ${r.window}` },
          {
            key: "current",
            header: "Current",
            render: (r) => (
              <span className="tabular-nums">
                {r.current} ({Math.round((r.current / r.limit) * 100)}%)
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}
