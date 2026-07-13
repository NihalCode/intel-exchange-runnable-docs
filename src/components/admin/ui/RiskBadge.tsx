"use client";

const RISK_STYLES = {
  low: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  medium: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  high: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  critical: "bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-100",
  restricted: "bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-100",
} as const;

export type RiskLevel = keyof typeof RISK_STYLES;

export function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium capitalize ${RISK_STYLES[level]}`}
    >
      {level}
    </span>
  );
}
