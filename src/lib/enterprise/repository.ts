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
