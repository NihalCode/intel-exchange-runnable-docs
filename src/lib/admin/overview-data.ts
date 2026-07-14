import type { EnterpriseAuditEvent } from "@/lib/enterprise/audit";
import type {
  BackgroundJobRecord,
  ControlPlaneResourceRecord,
} from "@/lib/enterprise/repository";
import type { ChangeRequestRecord, ChangeRequestState } from "@/lib/enterprise/types";

export const PENDING_CHANGE_STATES: readonly ChangeRequestState[] = [
  "DRAFT",
  "PENDING_REVIEW",
  "APPROVED",
  "SCHEDULED",
  "DEPLOYING",
];

export interface OverviewMetric {
  label: string;
  value: string;
  change?: string;
  trend?: "up" | "down" | "flat";
  sparkline?: number[];
}

export interface OverviewHealthService {
  name: string;
  status: "healthy" | "degraded" | "down";
  latencyMs: number | null;
  lastChecked: string;
}

export interface OverviewActivityItem {
  id: string;
  action: string;
  actor: string;
  outcome: EnterpriseAuditEvent["outcome"];
  timestamp: string;
}

const DAY_MS = 86_400_000;
const SPARKLINE_DAYS = 12;

function parseTime(iso: string): number {
  return new Date(iso).getTime();
}

function startOfUtcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function countBetween<T extends { createdAt: string }>(
  items: T[],
  fromMs: number,
  toMs: number
): number {
  return items.filter((item) => {
    const t = parseTime(item.createdAt);
    return t >= fromMs && t < toMs;
  }).length;
}

function dailySparkline<T extends { createdAt: string }>(
  items: T[],
  now: Date,
  days = SPARKLINE_DAYS
): number[] {
  const todayStart = startOfUtcDay(now);
  const buckets: number[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const from = todayStart - i * DAY_MS;
    const to = from + DAY_MS;
    buckets.push(countBetween(items, from, to));
  }
  return buckets;
}

function dailyFailedJobSparkline(jobs: BackgroundJobRecord[], now: Date): number[] {
  const failed = jobs.filter((job) => job.status === "failed");
  return dailySparkline(failed, now);
}

function trendFromDelta(delta: number): "up" | "down" | "flat" {
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "flat";
}

function formatDelta(delta: number): string {
  if (delta === 0) return "0";
  return delta > 0 ? `+${delta}` : String(delta);
}

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function isPendingChange(change: ChangeRequestRecord): boolean {
  return PENDING_CHANGE_STATES.includes(change.state);
}

export function buildOverviewMetrics(input: {
  resources: ControlPlaneResourceRecord[];
  changes: ChangeRequestRecord[];
  jobs: BackgroundJobRecord[];
  audit: EnterpriseAuditEvent[];
  now?: Date;
}): OverviewMetric[] {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const dayAgo = nowMs - DAY_MS;
  const twoDaysAgo = nowMs - 2 * DAY_MS;
  const weekAgo = nowMs - 7 * DAY_MS;
  const twoWeeksAgo = nowMs - 14 * DAY_MS;

  const activeResources = input.resources.length;
  const docsAgentResources = input.resources.filter(
    (resource) => resource.resourceType === "docs-agent"
  ).length;

  const pendingChanges = input.changes.filter(isPendingChange);
  const awaitingReview = pendingChanges.filter(
    (change) => change.state === "PENDING_REVIEW"
  ).length;

  const failedJobs7d = input.jobs.filter(
    (job) => job.status === "failed" && parseTime(job.updatedAt) >= weekAgo
  ).length;
  const failedJobsPrev7d = input.jobs.filter((job) => {
    const t = parseTime(job.updatedAt);
    return job.status === "failed" && t >= twoWeeksAgo && t < weekAgo;
  }).length;

  const audit24h = countBetween(input.audit, dayAgo, nowMs);
  const auditPrev24h = countBetween(input.audit, twoDaysAgo, dayAgo);

  return [
    {
      label: "Active resources",
      value: String(activeResources),
      change:
        docsAgentResources > 0
          ? `${docsAgentResources} documentation agent`
          : "control-plane resources",
      trend: "flat",
      sparkline: Array.from({ length: SPARKLINE_DAYS }, () => activeResources),
    },
    {
      label: "Pending changes",
      value: String(pendingChanges.length),
      change:
        awaitingReview > 0
          ? `${awaitingReview} awaiting review`
          : pendingChanges.length > 0
            ? "in workflow"
            : "none open",
      trend: "flat",
      sparkline: dailySparkline(
        pendingChanges.map((change) => ({ createdAt: change.updatedAt })),
        now
      ),
    },
    {
      label: "Failed jobs (7d)",
      value: String(failedJobs7d),
      change: formatDelta(failedJobs7d - failedJobsPrev7d),
      trend: trendFromDelta(failedJobs7d - failedJobsPrev7d),
      sparkline: dailyFailedJobSparkline(input.jobs, now),
    },
    {
      label: "Audit events (24h)",
      value: formatCount(audit24h),
      change: formatDelta(audit24h - auditPrev24h),
      trend: trendFromDelta(audit24h - auditPrev24h),
      sparkline: dailySparkline(input.audit, now),
    },
  ];
}

export function buildOverviewHealth(input: {
  databaseOk: boolean;
  databaseLatencyMs: number;
  jobs: BackgroundJobRecord[];
  now?: Date;
}): OverviewHealthService[] {
  const now = input.now ?? new Date();
  const lastChecked = now.toISOString();
  const queued = input.jobs.filter((job) => job.status === "queued").length;
  const running = input.jobs.filter((job) => job.status === "running").length;
  const recentFailed = input.jobs.filter(
    (job) =>
      job.status === "failed" &&
      parseTime(job.updatedAt) >= now.getTime() - DAY_MS
  ).length;

  const queueDepth = queued + running;
  let jobStatus: OverviewHealthService["status"] = "healthy";
  if (recentFailed > 0) jobStatus = "degraded";
  if (recentFailed > 3 || queueDepth > 25) jobStatus = "down";

  const syncJobs = input.jobs.filter((job) => job.jobType.includes("sync"));
  const syncRecent = syncJobs.some(
    (job) => parseTime(job.updatedAt) >= now.getTime() - 7 * DAY_MS
  );
  const syncStatus: OverviewHealthService["status"] =
    !input.databaseOk || recentFailed > 2
      ? "degraded"
      : syncJobs.length === 0 && queueDepth === 0
        ? "healthy"
        : syncRecent || running > 0
          ? "healthy"
          : "degraded";

  return [
    {
      name: "Control plane database",
      status: input.databaseOk ? "healthy" : "down",
      latencyMs: input.databaseOk ? input.databaseLatencyMs : null,
      lastChecked,
    },
    {
      name: "Background job queue",
      status: jobStatus,
      latencyMs: queueDepth > 0 ? Math.min(50 + queueDepth * 4, 500) : 12,
      lastChecked,
    },
    {
      name: "Documentation sync worker",
      status: syncStatus,
      latencyMs: running > 0 ? 95 : syncRecent ? 140 : null,
      lastChecked,
    },
  ];
}

export function buildOverviewActivity(
  audit: EnterpriseAuditEvent[],
  limit = 12
): OverviewActivityItem[] {
  return audit.slice(0, limit).map((event) => ({
    id: event.id,
    action: event.action,
    actor: event.actorUserId ?? "system",
    outcome: event.outcome,
    timestamp: event.createdAt,
  }));
}
