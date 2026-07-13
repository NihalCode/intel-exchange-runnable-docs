import "server-only";

import { randomUUID } from "node:crypto";

import { db, type DbExecutor } from "@/lib/db/client";
import type {
  ChangeRequestRecord,
  ChangeRequestState,
  EnterpriseEnvironment,
} from "@/lib/enterprise/types";

function nowIso(): string {
  return new Date().toISOString();
}

function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export interface OrganizationRecord {
  id: string;
  auth0OrganizationId: string | null;
  slug: string;
  name: string;
  status: "active" | "suspended";
  version: number;
}

export interface MembershipRecord {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
  status: "active" | "disabled" | "pending";
  permissions: string[];
  version: number;
}

function rowToOrganization(row: Record<string, unknown>): OrganizationRecord {
  return {
    id: String(row.id),
    auth0OrganizationId:
      row.auth0_organization_id == null ? null : String(row.auth0_organization_id),
    slug: String(row.slug),
    name: String(row.name),
    status: row.status as OrganizationRecord["status"],
    version: Number(row.version),
  };
}

function rowToMembership(row: Record<string, unknown>): MembershipRecord {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    userId: String(row.user_id),
    role: String(row.role),
    status: row.status as MembershipRecord["status"],
    permissions: parseJsonArray(row.permissions_json),
    version: Number(row.version),
  };
}

export async function findOrganizationByAuth0Id(
  auth0OrganizationId: string,
  executor: DbExecutor = db
): Promise<OrganizationRecord | null> {
  const row = await executor.queryOne(
    "SELECT * FROM organizations WHERE auth0_organization_id = ? LIMIT 1",
    [auth0OrganizationId]
  );
  return row ? rowToOrganization(row) : null;
}

export async function findOrganizationById(
  organizationId: string,
  executor: DbExecutor = db
): Promise<OrganizationRecord | null> {
  const row = await executor.queryOne(
    "SELECT * FROM organizations WHERE id = ? LIMIT 1",
    [organizationId]
  );
  return row ? rowToOrganization(row) : null;
}

export async function countOrganizations(executor: DbExecutor = db): Promise<number> {
  const row = await executor.queryOne<{ count: number | string }>(
    "SELECT COUNT(*) AS count FROM organizations"
  );
  return Number(row?.count ?? 0);
}

export async function listOrganizations(
  executor: DbExecutor = db
): Promise<OrganizationRecord[]> {
  const rows = await executor.query("SELECT * FROM organizations ORDER BY created_at");
  return rows.map(rowToOrganization);
}

export async function createOrganization(
  input: {
    name: string;
    slug: string;
    auth0OrganizationId?: string | null;
  },
  executor: DbExecutor = db
): Promise<OrganizationRecord> {
  const id = randomUUID();
  const now = nowIso();
  await executor.execute(
    `INSERT INTO organizations (
      id, auth0_organization_id, slug, name, status, version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'active', 1, ?, ?)`,
    [id, input.auth0OrganizationId ?? null, input.slug, input.name, now, now]
  );
  return (await findOrganizationById(id, executor))!;
}

export async function findMembership(
  organizationId: string,
  userId: string,
  executor: DbExecutor = db
): Promise<MembershipRecord | null> {
  const row = await executor.queryOne(
    `SELECT * FROM organization_memberships
     WHERE organization_id = ? AND user_id = ? LIMIT 1`,
    [organizationId, userId]
  );
  return row ? rowToMembership(row) : null;
}

export async function listActiveMembershipsForUser(
  userId: string,
  executor: DbExecutor = db
): Promise<MembershipRecord[]> {
  const rows = await executor.query(
    `SELECT * FROM organization_memberships
     WHERE user_id = ? AND status = 'active' ORDER BY created_at`,
    [userId]
  );
  return rows.map(rowToMembership);
}

export async function createMembership(
  input: {
    organizationId: string;
    userId: string;
    role: string;
    permissions?: readonly string[];
  },
  executor: DbExecutor = db
): Promise<MembershipRecord> {
  const id = randomUUID();
  const now = nowIso();
  await executor.execute(
    `INSERT INTO organization_memberships (
      id, organization_id, user_id, role, status, permissions_json,
      version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'active', ?, 1, ?, ?)`,
    [
      id,
      input.organizationId,
      input.userId,
      input.role,
      JSON.stringify(input.permissions ?? []),
      now,
      now,
    ]
  );
  return (await findMembership(input.organizationId, input.userId, executor))!;
}

export interface ControlPlaneResourceRecord {
  id: string;
  organizationId: string;
  resourceType: string;
  name: string;
  environment: EnterpriseEnvironment;
  activeConfigVersion: number | null;
  version: number;
}

function rowToResource(row: Record<string, unknown>): ControlPlaneResourceRecord {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    resourceType: String(row.resource_type),
    name: String(row.name),
    environment: row.environment as EnterpriseEnvironment,
    activeConfigVersion:
      row.active_config_version == null ? null : Number(row.active_config_version),
    version: Number(row.version),
  };
}

export async function createControlPlaneResource(
  input: {
    organizationId: string;
    resourceType: string;
    name: string;
    environment: EnterpriseEnvironment;
    createdByUserId: string;
  },
  executor: DbExecutor = db
): Promise<ControlPlaneResourceRecord> {
  const id = randomUUID();
  const now = nowIso();
  await executor.execute(
    `INSERT INTO control_plane_resources (
      id, organization_id, resource_type, name, environment, status,
      version, created_by_user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'active', 1, ?, ?, ?)`,
    [
      id,
      input.organizationId,
      input.resourceType,
      input.name,
      input.environment,
      input.createdByUserId,
      now,
      now,
    ]
  );
  return (await findControlPlaneResource(input.organizationId, id, executor))!;
}

export async function findControlPlaneResource(
  organizationId: string,
  id: string,
  executor: DbExecutor = db
): Promise<ControlPlaneResourceRecord | null> {
  const row = await executor.queryOne(
    "SELECT * FROM control_plane_resources WHERE organization_id = ? AND id = ? LIMIT 1",
    [organizationId, id]
  );
  return row ? rowToResource(row) : null;
}

export async function listControlPlaneResources(
  organizationId: string,
  executor: DbExecutor = db
): Promise<ControlPlaneResourceRecord[]> {
  const rows = await executor.query(
    `SELECT * FROM control_plane_resources
     WHERE organization_id = ? AND status = 'active'
     ORDER BY environment, name`,
    [organizationId]
  );
  return rows.map(rowToResource);
}

export async function updateControlPlaneResource(
  input: {
    organizationId: string;
    id: string;
    name: string;
    expectedVersion: number;
  },
  executor: DbExecutor = db
): Promise<ControlPlaneResourceRecord> {
  await executor.execute(
    `UPDATE control_plane_resources
     SET name = ?, version = version + 1, updated_at = ?
     WHERE organization_id = ? AND id = ? AND version = ?`,
    [input.name, nowIso(), input.organizationId, input.id, input.expectedVersion]
  );
  const updated = await findControlPlaneResource(
    input.organizationId,
    input.id,
    executor
  );
  if (!updated) throw new ResourceNotFoundError();
  if (updated.version !== input.expectedVersion + 1) throw new OptimisticLockError();
  return updated;
}

export async function createConfigVersion(
  input: {
    organizationId: string;
    resourceId: string;
    config: Record<string, unknown>;
    sanitizedDiff: Record<string, unknown>;
    createdByUserId: string;
  },
  executor: DbExecutor = db
): Promise<{ id: string; versionNumber: number }> {
  const row = await executor.queryOne<{ next_version: number | string }>(
    `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version
     FROM control_plane_config_versions
     WHERE organization_id = ? AND resource_id = ?`,
    [input.organizationId, input.resourceId]
  );
  const versionNumber = Number(row?.next_version ?? 1);
  const id = randomUUID();
  await executor.execute(
    `INSERT INTO control_plane_config_versions (
      id, organization_id, resource_id, version_number, config_json,
      sanitized_diff_json, created_by_user_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.organizationId,
      input.resourceId,
      versionNumber,
      JSON.stringify(input.config),
      JSON.stringify(input.sanitizedDiff),
      input.createdByUserId,
      nowIso(),
    ]
  );
  return { id, versionNumber };
}

export async function findConfigVersion(
  organizationId: string,
  id: string,
  executor: DbExecutor = db
): Promise<{ id: string; resourceId: string; versionNumber: number } | null> {
  const row = await executor.queryOne(
    `SELECT id, resource_id, version_number
     FROM control_plane_config_versions
     WHERE organization_id = ? AND id = ? LIMIT 1`,
    [organizationId, id]
  );
  return row
    ? {
        id: String(row.id),
        resourceId: String(row.resource_id),
        versionNumber: Number(row.version_number),
      }
    : null;
}

export interface ConfigVersionDetail {
  id: string;
  resourceId: string;
  versionNumber: number;
  config: Record<string, unknown>;
  sanitizedDiff: Record<string, unknown>;
  createdByUserId: string;
  createdAt: string;
}

export async function getConfigVersionDetail(
  organizationId: string,
  id: string,
  executor: DbExecutor = db
): Promise<ConfigVersionDetail | null> {
  const row = await executor.queryOne(
    `SELECT id, resource_id, version_number, config_json, sanitized_diff_json,
            created_by_user_id, created_at
     FROM control_plane_config_versions
     WHERE organization_id = ? AND id = ? LIMIT 1`,
    [organizationId, id]
  );
  if (!row) return null;
  return {
    id: String(row.id),
    resourceId: String(row.resource_id),
    versionNumber: Number(row.version_number),
    config: parseJsonObject(row.config_json),
    sanitizedDiff: parseJsonObject(row.sanitized_diff_json),
    createdByUserId: String(row.created_by_user_id),
    createdAt: String(row.created_at),
  };
}

export async function getActiveConfigForResource(
  organizationId: string,
  resourceId: string,
  executor: DbExecutor = db
): Promise<Record<string, unknown> | null> {
  const resource = await findControlPlaneResource(organizationId, resourceId, executor);
  if (!resource?.activeConfigVersion) return null;
  const row = await executor.queryOne(
    `SELECT config_json FROM control_plane_config_versions
     WHERE organization_id = ? AND resource_id = ? AND version_number = ? LIMIT 1`,
    [organizationId, resourceId, resource.activeConfigVersion]
  );
  return row ? parseJsonObject(row.config_json) : null;
}

export interface ConfigVersionRecord {
  id: string;
  resourceId: string;
  versionNumber: number;
  sanitizedDiff: Record<string, unknown>;
  createdByUserId: string;
  createdAt: string;
}

export async function listConfigVersions(
  organizationId: string,
  resourceId: string,
  executor: DbExecutor = db
): Promise<ConfigVersionRecord[]> {
  const rows = await executor.query(
    `SELECT id, resource_id, version_number, sanitized_diff_json,
            created_by_user_id, created_at
     FROM control_plane_config_versions
     WHERE organization_id = ? AND resource_id = ?
     ORDER BY version_number DESC`,
    [organizationId, resourceId]
  );
  return rows.map((row) => ({
    id: String(row.id),
    resourceId: String(row.resource_id),
    versionNumber: Number(row.version_number),
    sanitizedDiff:
      (parseJsonObject(row.sanitized_diff_json) as Record<string, unknown>) ?? {},
    createdByUserId: String(row.created_by_user_id),
    createdAt: String(row.created_at),
  }));
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  try {
    const parsed = JSON.parse(String(value ?? "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function rowToChangeRequest(row: Record<string, unknown>): ChangeRequestRecord {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    resourceId: String(row.resource_id),
    targetConfigVersionId: String(row.target_config_version_id),
    state: row.state as ChangeRequestState,
    requestedByUserId: String(row.requested_by_user_id),
    approvedByUserId:
      row.approved_by_user_id == null ? null : String(row.approved_by_user_id),
    scheduledFor: row.scheduled_for == null ? null : String(row.scheduled_for),
    activatedAt: row.activated_at == null ? null : String(row.activated_at),
    rollbackOfChangeRequestId:
      row.rollback_of_change_request_id == null
        ? null
        : String(row.rollback_of_change_request_id),
    version: Number(row.version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function findChangeRequest(
  organizationId: string,
  id: string,
  executor: DbExecutor = db
): Promise<ChangeRequestRecord | null> {
  const row = await executor.queryOne(
    "SELECT * FROM change_requests WHERE organization_id = ? AND id = ? LIMIT 1",
    [organizationId, id]
  );
  return row ? rowToChangeRequest(row) : null;
}

export async function listChangeRequests(
  organizationId: string,
  limit = 100,
  executor: DbExecutor = db
): Promise<ChangeRequestRecord[]> {
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 200);
  const rows = await executor.query(
    `SELECT * FROM change_requests
     WHERE organization_id = ? ORDER BY updated_at DESC LIMIT ?`,
    [organizationId, safeLimit]
  );
  return rows.map(rowToChangeRequest);
}

export async function listDueScheduledChanges(
  organizationId: string,
  asOf: string,
  limit = 25,
  executor: DbExecutor = db
): Promise<ChangeRequestRecord[]> {
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 100);
  const rows = await executor.query(
    `SELECT * FROM change_requests
     WHERE organization_id = ? AND state = 'SCHEDULED' AND scheduled_for <= ?
     ORDER BY scheduled_for ASC LIMIT ?`,
    [organizationId, asOf, safeLimit]
  );
  return rows.map(rowToChangeRequest);
}

export async function createChangeRequestRecord(
  input: {
    organizationId: string;
    resourceId: string;
    targetConfigVersionId: string;
    requestedByUserId: string;
    idempotencyKey?: string;
    rollbackOfChangeRequestId?: string;
  },
  executor: DbExecutor = db
): Promise<ChangeRequestRecord> {
  if (input.idempotencyKey) {
    const existing = await executor.queryOne(
      `SELECT * FROM change_requests
       WHERE organization_id = ? AND idempotency_key = ? LIMIT 1`,
      [input.organizationId, input.idempotencyKey]
    );
    if (existing) return rowToChangeRequest(existing);
  }
  const id = randomUUID();
  const now = nowIso();
  await executor.execute(
    `INSERT INTO change_requests (
      id, organization_id, resource_id, target_config_version_id, state,
      requested_by_user_id, rollback_of_change_request_id, idempotency_key,
      version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'DRAFT', ?, ?, ?, 1, ?, ?)`,
    [
      id,
      input.organizationId,
      input.resourceId,
      input.targetConfigVersionId,
      input.requestedByUserId,
      input.rollbackOfChangeRequestId ?? null,
      input.idempotencyKey ?? null,
      now,
      now,
    ]
  );
  return (await findChangeRequest(input.organizationId, id, executor))!;
}

export async function transitionChangeRequest(
  input: {
    organizationId: string;
    id: string;
    expectedVersion: number;
    from: ChangeRequestState;
    to: ChangeRequestState;
    approvedByUserId?: string;
    scheduledFor?: string;
    activatedAt?: string;
  },
  executor: DbExecutor = db
): Promise<ChangeRequestRecord> {
  const now = nowIso();
  await executor.execute(
    `UPDATE change_requests
     SET state = ?, approved_by_user_id = COALESCE(?, approved_by_user_id),
         scheduled_for = COALESCE(?, scheduled_for),
         activated_at = COALESCE(?, activated_at),
         version = version + 1, updated_at = ?
     WHERE organization_id = ? AND id = ? AND state = ? AND version = ?`,
    [
      input.to,
      input.approvedByUserId ?? null,
      input.scheduledFor ?? null,
      input.activatedAt ?? null,
      now,
      input.organizationId,
      input.id,
      input.from,
      input.expectedVersion,
    ]
  );
  const updated = await findChangeRequest(input.organizationId, input.id, executor);
  if (
    !updated ||
    updated.version !== input.expectedVersion + 1 ||
    updated.state !== input.to
  ) {
    throw new OptimisticLockError();
  }
  return updated;
}

export async function addChangeApproval(
  input: {
    organizationId: string;
    changeRequestId: string;
    approverUserId: string;
    decision: "APPROVED" | "REJECTED";
    comment?: string;
  },
  executor: DbExecutor = db
): Promise<void> {
  await executor.execute(
    `INSERT INTO change_request_approvals (
      id, organization_id, change_request_id, approver_user_id,
      decision, comment, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      input.organizationId,
      input.changeRequestId,
      input.approverUserId,
      input.decision,
      input.comment ?? null,
      nowIso(),
    ]
  );
}

export async function activateResourceVersion(
  input: {
    organizationId: string;
    resourceId: string;
    configVersion: number;
    expectedResourceVersion: number;
  },
  executor: DbExecutor = db
): Promise<void> {
  await executor.execute(
    `UPDATE control_plane_resources
     SET active_config_version = ?, version = version + 1, updated_at = ?
     WHERE organization_id = ? AND id = ? AND version = ?`,
    [
      input.configVersion,
      nowIso(),
      input.organizationId,
      input.resourceId,
      input.expectedResourceVersion,
    ]
  );
  const resource = await findControlPlaneResource(
    input.organizationId,
    input.resourceId,
    executor
  );
  if (
    !resource ||
    resource.version !== input.expectedResourceVersion + 1 ||
    resource.activeConfigVersion !== input.configVersion
  ) {
    throw new OptimisticLockError();
  }
}

export class OptimisticLockError extends Error {
  constructor() {
    super("The resource changed; reload and retry");
    this.name = "OptimisticLockError";
  }
}

export class ResourceNotFoundError extends Error {
  constructor() {
    super("Resource not found");
    this.name = "ResourceNotFoundError";
  }
}

export type BackgroundJobStatus = "queued" | "running" | "completed" | "failed";

export interface BackgroundJobRecord {
  id: string;
  organizationId: string;
  jobType: string;
  status: BackgroundJobStatus;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  attempts: number;
  maxAttempts: number;
  runAfter: string;
  lockedAt: string | null;
  lockedBy: string | null;
  lastError: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

function rowToBackgroundJob(row: Record<string, unknown>): BackgroundJobRecord {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    jobType: String(row.job_type),
    status: row.status as BackgroundJobStatus,
    payload: parseJsonObject(row.payload_json),
    result:
      row.result_json == null ? null : parseJsonObject(row.result_json),
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    runAfter: String(row.run_after),
    lockedAt: row.locked_at == null ? null : String(row.locked_at),
    lockedBy: row.locked_by == null ? null : String(row.locked_by),
    lastError: row.last_error == null ? null : String(row.last_error),
    version: Number(row.version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function enqueueJob(
  input: {
    organizationId: string;
    jobType: string;
    payload?: Record<string, unknown>;
    runAfter?: string;
    maxAttempts?: number;
  },
  executor: DbExecutor = db
): Promise<BackgroundJobRecord> {
  const id = randomUUID();
  const now = nowIso();
  const runAfter = input.runAfter ?? now;
  await executor.execute(
    `INSERT INTO background_jobs (
      id, organization_id, job_type, status, payload_json, attempts, max_attempts,
      run_after, version, created_at, updated_at
    ) VALUES (?, ?, ?, 'queued', ?, 0, ?, ?, 1, ?, ?)`,
    [
      id,
      input.organizationId,
      input.jobType,
      JSON.stringify(input.payload ?? {}),
      input.maxAttempts ?? 5,
      runAfter,
      now,
      now,
    ]
  );
  const row = await executor.queryOne(
    "SELECT * FROM background_jobs WHERE organization_id = ? AND id = ? LIMIT 1",
    [input.organizationId, id]
  );
  return rowToBackgroundJob(row!);
}

export async function listJobs(
  organizationId: string,
  limit = 50,
  executor: DbExecutor = db
): Promise<BackgroundJobRecord[]> {
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 200);
  const rows = await executor.query(
    `SELECT * FROM background_jobs
     WHERE organization_id = ?
     ORDER BY created_at DESC LIMIT ?`,
    [organizationId, safeLimit]
  );
  return rows.map(rowToBackgroundJob);
}

export async function claimDueJobs(
  input: {
    organizationId: string;
    lockedBy: string;
    limit?: number;
  },
  executor: DbExecutor = db
): Promise<BackgroundJobRecord[]> {
  const safeLimit = Math.min(Math.max(Math.floor(input.limit ?? 10), 1), 50);
  const now = nowIso();
  const candidates = await executor.query(
    `SELECT * FROM background_jobs
     WHERE organization_id = ? AND status = 'queued' AND run_after <= ?
     ORDER BY run_after ASC LIMIT ?`,
    [input.organizationId, now, safeLimit]
  );
  const claimed: BackgroundJobRecord[] = [];
  for (const candidate of candidates) {
    const id = String(candidate.id);
    const version = Number(candidate.version);
    await executor.execute(
      `UPDATE background_jobs
       SET status = 'running', locked_at = ?, locked_by = ?,
           attempts = attempts + 1, version = version + 1, updated_at = ?
       WHERE organization_id = ? AND id = ? AND status = 'queued' AND version = ?`,
      [now, input.lockedBy, now, input.organizationId, id, version]
    );
    const updated = await executor.queryOne(
      "SELECT * FROM background_jobs WHERE organization_id = ? AND id = ? LIMIT 1",
      [input.organizationId, id]
    );
    if (updated && String(updated.status) === "running") {
      claimed.push(rowToBackgroundJob(updated));
    }
  }
  return claimed;
}

export async function completeJob(
  input: {
    organizationId: string;
    id: string;
    expectedVersion: number;
    result?: Record<string, unknown>;
  },
  executor: DbExecutor = db
): Promise<BackgroundJobRecord> {
  const now = nowIso();
  await executor.execute(
    `UPDATE background_jobs
     SET status = 'completed', result_json = ?, last_error = NULL,
         version = version + 1, updated_at = ?
     WHERE organization_id = ? AND id = ? AND status = 'running' AND version = ?`,
    [
      JSON.stringify(input.result ?? {}),
      now,
      input.organizationId,
      input.id,
      input.expectedVersion,
    ]
  );
  const row = await executor.queryOne(
    "SELECT * FROM background_jobs WHERE organization_id = ? AND id = ? LIMIT 1",
    [input.organizationId, input.id]
  );
  if (!row || String(row.status) !== "completed") {
    throw new OptimisticLockError();
  }
  return rowToBackgroundJob(row);
}

export async function failJob(
  input: {
    organizationId: string;
    id: string;
    expectedVersion: number;
    error: string;
  },
  executor: DbExecutor = db
): Promise<BackgroundJobRecord> {
  const now = nowIso();
  const row = await executor.queryOne(
    "SELECT attempts, max_attempts FROM background_jobs WHERE organization_id = ? AND id = ? LIMIT 1",
    [input.organizationId, input.id]
  );
  if (!row) throw new OptimisticLockError();
  const attempts = Number(row.attempts);
  const maxAttempts = Number(row.max_attempts);
  const terminal = attempts >= maxAttempts;
  await executor.execute(
    `UPDATE background_jobs
     SET status = ?, last_error = ?, locked_at = NULL, locked_by = NULL,
         version = version + 1, updated_at = ?
     WHERE organization_id = ? AND id = ? AND status = 'running' AND version = ?`,
    [
      terminal ? "failed" : "queued",
      input.error.slice(0, 500),
      now,
      input.organizationId,
      input.id,
      input.expectedVersion,
    ]
  );
  const updated = await executor.queryOne(
    "SELECT * FROM background_jobs WHERE organization_id = ? AND id = ? LIMIT 1",
    [input.organizationId, input.id]
  );
  if (!updated) throw new OptimisticLockError();
  return rowToBackgroundJob(updated);
}
