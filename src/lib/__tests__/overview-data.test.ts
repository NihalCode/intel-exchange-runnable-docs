import { describe, expect, it } from "vitest";

import {
  buildOverviewActivity,
  buildOverviewHealth,
  buildOverviewMetrics,
} from "@/lib/admin/overview-data";
import type { EnterpriseAuditEvent } from "@/lib/enterprise/audit";
import type {
  BackgroundJobRecord,
  ControlPlaneResourceRecord,
} from "@/lib/enterprise/repository";
import type { ChangeRequestRecord } from "@/lib/enterprise/types";

const NOW = new Date("2026-07-13T18:00:00.000Z");

function resource(id: string): ControlPlaneResourceRecord {
  return {
    id,
    organizationId: "org-1",
    resourceType: "docs-agent",
    name: `Resource ${id}`,
    environment: "development",
    activeConfigVersion: 1,
    version: 1,
  };
}

function change(
  id: string,
  state: ChangeRequestRecord["state"],
  updatedAt: string
): ChangeRequestRecord {
  return {
    id,
    organizationId: "org-1",
    resourceId: "res-1",
    targetConfigVersionId: "ver-1",
    state,
    requestedByUserId: "user-1",
    approvedByUserId: null,
    scheduledFor: null,
    activatedAt: null,
    rollbackOfChangeRequestId: null,
    version: 1,
    createdAt: updatedAt,
    updatedAt,
  };
}

function job(
  id: string,
  status: BackgroundJobRecord["status"],
  updatedAt: string
): BackgroundJobRecord {
  return {
    id,
    organizationId: "org-1",
    jobType: "noop",
    status,
    payload: {},
    result: null,
    attempts: 1,
    maxAttempts: 5,
    runAfter: updatedAt,
    lockedAt: null,
    lockedBy: null,
    lastError: status === "failed" ? "boom" : null,
    version: 1,
    createdAt: updatedAt,
    updatedAt,
  };
}

function audit(id: string, createdAt: string): EnterpriseAuditEvent {
  return {
    id,
    organizationId: "org-1",
    actorUserId: "user-1",
    action: "change.submitted",
    resourceType: "change_request",
    resourceId: "chg-1",
    outcome: "success",
    correlationId: "corr-1",
    requestId: null,
    metadata: {},
    createdAt,
  };
}

describe("overview-data", () => {
  it("buildOverviewMetrics counts resources, pending changes, failed jobs, and audit events", () => {
    const metrics = buildOverviewMetrics({
      now: NOW,
      resources: [resource("r1"), resource("r2")],
      changes: [
        change("c1", "PENDING_REVIEW", "2026-07-13T10:00:00.000Z"),
        change("c2", "ACTIVE", "2026-07-12T10:00:00.000Z"),
      ],
      jobs: [
        job("j1", "failed", "2026-07-12T10:00:00.000Z"),
        job("j2", "completed", "2026-07-10T10:00:00.000Z"),
      ],
      audit: [
        audit("a1", "2026-07-13T12:00:00.000Z"),
        audit("a2", "2026-07-12T12:00:00.000Z"),
      ],
    });

    expect(metrics).toHaveLength(4);
    expect(metrics[0]).toMatchObject({ label: "Active resources", value: "2" });
    expect(metrics[1]).toMatchObject({
      label: "Pending changes",
      value: "1",
      change: "1 awaiting review",
    });
    expect(metrics[2]).toMatchObject({ label: "Failed jobs (7d)", value: "1" });
    expect(metrics[3]).toMatchObject({ label: "Audit events (24h)", value: "1" });
  });

  it("buildOverviewHealth reflects database and job queue state", () => {
    const health = buildOverviewHealth({
      now: NOW,
      databaseOk: true,
      databaseLatencyMs: 18,
      jobs: [job("j1", "queued", "2026-07-13T12:00:00.000Z")],
    });

    expect(health[0]).toMatchObject({
      name: "Control plane database",
      status: "healthy",
      latencyMs: 18,
    });
    expect(health[1].name).toBe("Background job queue");
    expect(health[2].name).toBe("Documentation sync worker");
    expect(health).toHaveLength(3);
  });

  it("buildOverviewActivity maps audit events", () => {
    const activity = buildOverviewActivity([
      audit("a1", "2026-07-13T12:00:00.000Z"),
    ]);

    expect(activity).toHaveLength(1);
    expect(activity[0]).toMatchObject({
      id: "a1",
      action: "change.submitted",
      actor: "user-1",
      outcome: "success",
    });
  });
});
