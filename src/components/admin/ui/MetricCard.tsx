"use client";

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
      className="h-5 w-16 text-[var(--atlas-signal)]"
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
      ? "text-[var(--atlas-signal)]"
      : trend === "down"
        ? "text-[var(--atlas-danger)]"
        : "text-[var(--atlas-text-muted)]";

  return (
    <div
      className="sf-signal-metric atlas-telemetry rounded-[var(--radius-sm)] border border-[var(--atlas-line)] bg-[color-mix(in_srgb,var(--atlas-elevated)_88%,transparent)] p-3"
      data-testid="metric-card"
      data-layout="sf-signal-metric"
    >
      <p className="atlas-micro-label">{label}</p>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <div>
          <p className="atlas-telemetry__value text-xl">{value}</p>
          {change ? <p className={`mt-0.5 font-mono text-[10px] ${trendColor}`}>{change}</p> : null}
        </div>
        {sparkline?.length ? <Sparkline values={sparkline} /> : null}
      </div>
    </div>
  );
}
