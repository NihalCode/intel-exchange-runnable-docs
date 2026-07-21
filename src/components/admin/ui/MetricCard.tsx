"use client";

import { cardClass } from "@/components/admin/ui/tokens";

export function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const width = 80;
  const height = 24;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values
    .map((v, i) => `${i * step},${height - ((v - min) / range) * height}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-6 w-20 text-[var(--accent-primary)]"
      aria-hidden="true"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
}

export function MetricCard({
  label,
  value,
  change,
  trend,
  sparkline,
}: {
  label: string;
  value: string;
  change?: string;
  trend?: "up" | "down" | "flat";
  sparkline?: number[];
}) {
  const trendColor =
    trend === "up"
      ? "text-emerald-600 dark:text-emerald-400"
      : trend === "down"
        ? "text-red-600 dark:text-red-400"
        : "text-[var(--text-muted)]";

  return (
    <div className={cardClass} data-testid="metric-card">
      <p className="text-sm text-[var(--text-secondary)]">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div>
          <p className="text-2xl font-semibold tabular-nums text-[var(--text-heading)]">{value}</p>
          {change ? <p className={`mt-1 text-xs font-medium ${trendColor}`}>{change}</p> : null}
        </div>
        {sparkline?.length ? <Sparkline values={sparkline} /> : null}
      </div>
    </div>
  );
}
