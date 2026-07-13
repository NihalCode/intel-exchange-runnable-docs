import "server-only";

import { randomUUID } from "node:crypto";

import { db, type DbExecutor } from "@/lib/db/client";
import {
  redactStructuredValue,
  type EnterpriseAuditAction,
} from "@/lib/enterprise/observability";

export interface EnterpriseAuditEvent {
  id: string;
  organizationId: string;
  actorUserId: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  outcome: "success" | "denied" | "failure";
  correlationId: string;
  requestId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

function parseMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  try {
    const parsed = JSON.parse(String(value ?? "{}"));
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function rowToAudit(row: Record<string, unknown>): EnterpriseAuditEvent {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    actorUserId: row.actor_user_id == null ? null : String(row.actor_user_id),
    action: String(row.action),
    resourceType: row.resource_type == null ? null : String(row.resource_type),
    resourceId: row.resource_id == null ? null : String(row.resource_id),
    outcome: row.outcome as EnterpriseAuditEvent["outcome"],
    correlationId: String(row.correlation_id),
    requestId: row.request_id == null ? null : String(row.request_id),
    metadata: parseMetadata(row.metadata_json),
    createdAt: String(row.created_at),
  };
}

/**
 * Append-only by design. No update or delete operation is exported, and the
 * database migration independently rejects either mutation.
 */
export async function appendEnterpriseAuditEvent(
  input: {
    organizationId: string;
    actorUserId?: string | null;
    action: EnterpriseAuditAction | string;
    resourceType?: string | null;
    resourceId?: string | null;
    outcome: "success" | "denied" | "failure";
    correlationId: string;
    requestId?: string | null;
    metadata?: Record<string, unknown>;
  },
  executor: DbExecutor = db
): Promise<EnterpriseAuditEvent> {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const metadata = redactStructuredValue(input.metadata ?? {});
  await executor.execute(
    `INSERT INTO enterprise_audit_events (
      id, organization_id, actor_user_id, action, resource_type, resource_id,
      outcome, correlation_id, request_id, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.organizationId,
      input.actorUserId ?? null,
      input.action,
      input.resourceType ?? null,
      input.resourceId ?? null,
      input.outcome,
      input.correlationId,
      input.requestId ?? null,
      JSON.stringify(metadata),
      createdAt,
    ]
  );
  return {
    id,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    resourceType: input.resourceType ?? null,
    resourceId: input.resourceId ?? null,
    outcome: input.outcome,
    correlationId: input.correlationId,
    requestId: input.requestId ?? null,
    metadata,
    createdAt,
  };
}

export async function listEnterpriseAuditEvents(
  organizationId: string,
  limit = 100,
  executor: DbExecutor = db
): Promise<EnterpriseAuditEvent[]> {
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 500);
  const rows = await executor.query(
    `SELECT * FROM enterprise_audit_events
     WHERE organization_id = ? ORDER BY created_at DESC LIMIT ?`,
    [organizationId, safeLimit]
  );
  return rows.map(rowToAudit);
}
