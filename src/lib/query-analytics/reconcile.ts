import "server-only";

import { db, ensureMigrations } from "@/lib/db/client";
import { appendEnterpriseAuditEvent } from "@/lib/enterprise/audit";
import { randomUUID } from "node:crypto";

export interface ReconcileReport {
  organizationId: string | null;
  logicalQueries: number;
  attempts: number;
  projectionEvents: number;
  projectionMissingAttempts: number;
  orphanProjections: number;
  pendingOutbox: number;
  deadLetterOutbox: number;
  exactMatch: boolean;
}

/**
 * Compare authoritative tables to compatibility projection.
 * Tolerance is 0 — every attempt should have a projection row.
 */
export async function reconcileQueryAnalytics(
  organizationId?: string
): Promise<ReconcileReport[]> {
  ensureMigrations();
  const orgs = organizationId
    ? [{ id: organizationId }]
    : await db.query<{ id: string }>(`SELECT id FROM organizations ORDER BY id`);

  const reports: ReconcileReport[] = [];
  for (const org of orgs) {
    const orgId = org.id;
    const logical = await db.queryOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM query_logical_queries WHERE organization_id = ?`,
      [orgId]
    );
    const attempts = await db.queryOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM query_attempts WHERE organization_id = ?`,
      [orgId]
    );
    const events = await db.queryOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM query_analytics_events WHERE organization_id = ?`,
      [orgId]
    );
    const missing = await db.queryOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM query_attempts a
       WHERE a.organization_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM query_analytics_events e
           WHERE e.organization_id = a.organization_id AND e.attempt_id = a.attempt_id
         )`,
      [orgId]
    );
    const orphans = await db.queryOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM query_analytics_events e
       WHERE e.organization_id = ?
         AND e.attempt_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM query_attempts a
           WHERE a.organization_id = e.organization_id AND a.attempt_id = e.attempt_id
         )`,
      [orgId]
    );
    const pending = await db.queryOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM analytics_outbox
       WHERE organization_id = ? AND status IN ('pending','processing')`,
      [orgId]
    );
    const dead = await db.queryOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM analytics_outbox
       WHERE organization_id = ? AND status = 'dead_letter'`,
      [orgId]
    );

    const projectionMissingAttempts = Number(missing?.c ?? 0);
    const orphanProjections = Number(orphans?.c ?? 0);
    reports.push({
      organizationId: orgId,
      logicalQueries: Number(logical?.c ?? 0),
      attempts: Number(attempts?.c ?? 0),
      projectionEvents: Number(events?.c ?? 0),
      projectionMissingAttempts,
      orphanProjections,
      pendingOutbox: Number(pending?.c ?? 0),
      deadLetterOutbox: Number(dead?.c ?? 0),
      exactMatch: projectionMissingAttempts === 0 && orphanProjections === 0,
    });
  }
  return reports;
}

/**
 * Repair missing projection rows from authoritative attempts.
 * Default dry-run; apply requires confirm=true.
 */
export async function repairQueryAnalyticsProjection(input: {
  organizationId?: string;
  dryRun?: boolean;
  confirm?: boolean;
  actorUserId?: string | null;
}): Promise<{
  dryRun: boolean;
  wouldRepair: number;
  repaired: number;
  reports: ReconcileReport[];
}> {
  ensureMigrations();
  const dryRun = input.dryRun !== false && !input.confirm;
  const before = await reconcileQueryAnalytics(input.organizationId);
  let wouldRepair = 0;
  let repaired = 0;

  for (const report of before) {
    if (!report.organizationId || report.projectionMissingAttempts === 0) continue;
    wouldRepair += report.projectionMissingAttempts;
    if (dryRun) continue;

    const missing = await db.query<Record<string, unknown>>(
      `SELECT a.*, q.hostname, q.product_id, q.collection_id, q.intent, q.user_id,
              q.conversation_id, q.turn_id
       FROM query_attempts a
       JOIN query_logical_queries q ON q.id = a.logical_query_row_id
       WHERE a.organization_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM query_analytics_events e
           WHERE e.organization_id = a.organization_id AND e.attempt_id = a.attempt_id
         )`,
      [report.organizationId]
    );

    for (const row of missing) {
      const now = new Date().toISOString();
      await db.execute(
        `INSERT INTO query_analytics_events (
          id, organization_id, user_id, conversation_id, turn_id, logical_query_id, attempt_id,
          hostname, product_id, collection_id, intent, outcome, retrieval_result_count,
          citation_count, latency_ms, request_id, trace_id, model_version, prompt_version,
          index_version, metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(organization_id, attempt_id) DO NOTHING`,
        [
          randomUUID(),
          report.organizationId,
          row.user_id ?? null,
          row.conversation_id ?? null,
          row.turn_id ?? null,
          row.logical_query_id,
          row.attempt_id,
          row.hostname,
          row.product_id ?? null,
          row.collection_id ?? null,
          row.intent ?? null,
          row.outcome ?? "system_error",
          row.retrieval_result_count ?? null,
          row.citation_count ?? null,
          row.latency_ms ?? null,
          row.request_id ?? null,
          row.trace_id ?? null,
          row.model_version ?? null,
          row.prompt_version ?? null,
          row.index_version ?? null,
          row.metadata_json ?? "{}",
          now,
        ]
      );
      repaired += 1;
    }

    await appendEnterpriseAuditEvent({
      organizationId: report.organizationId,
      actorUserId: input.actorUserId ?? null,
      action: "query_analytics.repair",
      resourceType: "query_analytics",
      outcome: "success",
      correlationId: randomUUID(),
      metadata: { repaired: missing.length, dryRun: false },
    });
  }

  const after = dryRun ? before : await reconcileQueryAnalytics(input.organizationId);
  return { dryRun, wouldRepair, repaired, reports: after };
}
