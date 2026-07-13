import "server-only";

import { randomUUID } from "node:crypto";

import { db, withOrganizationTransaction } from "@/lib/db/client";
import type { DocumentationSchemaFormat } from "@/lib/documentation-schemas/validation";

export type SchemaVersionStatus =
  | "DRAFT"
  | "VALIDATING"
  | "VALID"
  | "INVALID"
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "SCHEDULED"
  | "PUBLISHING"
  | "PUBLISHED"
  | "FAILED"
  | "ROLLED_BACK"
  | "ARCHIVED";

export interface DocumentationSchemaRecord {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  format: DocumentationSchemaFormat;
  productId: string;
  environment: string;
  activeVersionId: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentationSchemaVersion {
  id: string;
  organizationId: string;
  schemaId: string;
  versionNumber: number;
  sourceText: string;
  sourceHash: string;
  status: SchemaVersionStatus;
  validation: Record<string, unknown>;
  diff: Record<string, unknown>;
  preview: Record<string, unknown>;
  breakingCount: number;
  authorUserId: string;
  approverUserId: string | null;
  reviewReason: string | null;
  publishedAt: string | null;
  rollbackOfVersionId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  try {
    const parsed = JSON.parse(String(value ?? "{}"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function schemaFromRow(row: Record<string, unknown>): DocumentationSchemaRecord {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    name: String(row.name),
    slug: String(row.slug),
    format: row.format as DocumentationSchemaFormat,
    productId: String(row.product_id),
    environment: String(row.environment),
    activeVersionId: row.active_version_id == null ? null : String(row.active_version_id),
    createdByUserId: String(row.created_by_user_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function versionFromRow(row: Record<string, unknown>): DocumentationSchemaVersion {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    schemaId: String(row.schema_id),
    versionNumber: Number(row.version_number),
    sourceText: String(row.source_text),
    sourceHash: String(row.source_hash),
    status: row.status as SchemaVersionStatus,
    validation: jsonObject(row.validation_json),
    diff: jsonObject(row.diff_json),
    preview: jsonObject(row.preview_json),
    breakingCount: Number(row.breaking_count),
    authorUserId: String(row.author_user_id),
    approverUserId: row.approver_user_id == null ? null : String(row.approver_user_id),
    reviewReason: row.review_reason == null ? null : String(row.review_reason),
    publishedAt: row.published_at == null ? null : String(row.published_at),
    rollbackOfVersionId:
      row.rollback_of_version_id == null ? null : String(row.rollback_of_version_id),
    version: Number(row.version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function listSchemas(organizationId: string): Promise<DocumentationSchemaRecord[]> {
  const rows = await db.query(
    `SELECT * FROM documentation_schemas WHERE organization_id = ?
     ORDER BY updated_at DESC`,
    [organizationId]
  );
  return rows.map(schemaFromRow);
}

export async function findSchema(
  organizationId: string,
  schemaId: string
): Promise<DocumentationSchemaRecord | null> {
  const row = await db.queryOne(
    "SELECT * FROM documentation_schemas WHERE organization_id = ? AND id = ?",
    [organizationId, schemaId]
  );
  return row ? schemaFromRow(row) : null;
}

export async function listSchemaVersions(
  organizationId: string,
  schemaId: string
): Promise<DocumentationSchemaVersion[]> {
  const rows = await db.query(
    `SELECT * FROM documentation_schema_versions
     WHERE organization_id = ? AND schema_id = ? ORDER BY version_number DESC`,
    [organizationId, schemaId]
  );
  return rows.map(versionFromRow);
}

export async function findSchemaVersion(
  organizationId: string,
  versionId: string
): Promise<DocumentationSchemaVersion | null> {
  const row = await db.queryOne(
    `SELECT * FROM documentation_schema_versions
     WHERE organization_id = ? AND id = ?`,
    [organizationId, versionId]
  );
  return row ? versionFromRow(row) : null;
}

export async function createSchemaWithVersion(input: {
  organizationId: string;
  userId: string;
  name: string;
  slug: string;
  format: DocumentationSchemaFormat;
  productId: string;
  environment: string;
  sourceText: string;
  sourceHash: string;
}): Promise<{ schema: DocumentationSchemaRecord; version: DocumentationSchemaVersion }> {
  return withOrganizationTransaction(
    { organizationId: input.organizationId, userId: input.userId },
    async (tx) => {
      const now = new Date().toISOString();
      const existingSchema = await tx.queryOne<Record<string, unknown>>(
        `SELECT * FROM documentation_schemas
         WHERE organization_id = ? AND slug = ? AND environment = ?`,
        [input.organizationId, input.slug, input.environment]
      );
      if (
        existingSchema &&
        (String(existingSchema.format) !== input.format ||
          String(existingSchema.product_id) !== input.productId)
      ) {
        throw new Error("SCHEMA_IDENTITY_CONFLICT");
      }
      const schemaId = existingSchema ? String(existingSchema.id) : randomUUID();
      const versionId = randomUUID();
      if (!existingSchema) {
        await tx.execute(
          `INSERT INTO documentation_schemas (
            id, organization_id, name, slug, format, product_id, environment,
            active_version_id, created_by_user_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
          [
            schemaId,
            input.organizationId,
            input.name,
            input.slug,
            input.format,
            input.productId,
            input.environment,
            input.userId,
            now,
            now,
          ]
        );
      } else {
        await tx.execute(
          `UPDATE documentation_schemas SET name = ?, updated_at = ?
           WHERE organization_id = ? AND id = ?`,
          [input.name, now, input.organizationId, schemaId]
        );
      }
      const latest = await tx.queryOne<{ version_number: number | string }>(
        `SELECT MAX(version_number) AS version_number
         FROM documentation_schema_versions WHERE organization_id = ? AND schema_id = ?`,
        [input.organizationId, schemaId]
      );
      const versionNumber = Number(latest?.version_number ?? 0) + 1;
      await tx.execute(
        `INSERT INTO documentation_schema_versions (
          id, organization_id, schema_id, version_number, source_text, source_hash,
          status, validation_json, diff_json, preview_json, breaking_count,
          author_user_id, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', '{}', '{}', '{}', 0, ?, 1, ?, ?)`,
        [
          versionId,
          input.organizationId,
          schemaId,
          versionNumber,
          input.sourceText,
          input.sourceHash,
          input.userId,
          now,
          now,
        ]
      );
      const schema = await tx.queryOne(
        "SELECT * FROM documentation_schemas WHERE id = ? AND organization_id = ?",
        [schemaId, input.organizationId]
      );
      const version = await tx.queryOne(
        "SELECT * FROM documentation_schema_versions WHERE id = ? AND organization_id = ?",
        [versionId, input.organizationId]
      );
      return { schema: schemaFromRow(schema!), version: versionFromRow(version!) };
    }
  );
}

export async function updateSchemaVersion(input: {
  organizationId: string;
  versionId: string;
  expectedVersion: number;
  status: SchemaVersionStatus;
  validation?: Record<string, unknown>;
  diff?: Record<string, unknown>;
  preview?: Record<string, unknown>;
  breakingCount?: number;
  approverUserId?: string | null;
  reviewReason?: string | null;
  publishedAt?: string | null;
}): Promise<DocumentationSchemaVersion> {
  const current = await findSchemaVersion(input.organizationId, input.versionId);
  if (!current) throw new Error("SCHEMA_VERSION_NOT_FOUND");
  if (current.version !== input.expectedVersion) throw new Error("VERSION_CONFLICT");
  const now = new Date().toISOString();
  await db.execute(
    `UPDATE documentation_schema_versions SET status = ?, validation_json = ?,
     diff_json = ?, preview_json = ?, breaking_count = ?, approver_user_id = ?,
     review_reason = ?, published_at = ?, version = version + 1, updated_at = ?
     WHERE organization_id = ? AND id = ? AND version = ?`,
    [
      input.status,
      JSON.stringify(input.validation ?? current.validation),
      JSON.stringify(input.diff ?? current.diff),
      JSON.stringify(input.preview ?? current.preview),
      input.breakingCount ?? current.breakingCount,
      input.approverUserId === undefined ? current.approverUserId : input.approverUserId,
      input.reviewReason === undefined ? current.reviewReason : input.reviewReason,
      input.publishedAt === undefined ? current.publishedAt : input.publishedAt,
      now,
      input.organizationId,
      input.versionId,
      input.expectedVersion,
    ]
  );
  const updated = await findSchemaVersion(input.organizationId, input.versionId);
  if (!updated || updated.version === current.version) throw new Error("VERSION_CONFLICT");
  return updated;
}

export async function activateSchemaVersion(input: {
  organizationId: string;
  userId: string;
  schemaId: string;
  versionId: string;
  expectedVersion: number;
  idempotencyKey: string;
}): Promise<DocumentationSchemaVersion> {
  return withOrganizationTransaction(
    { organizationId: input.organizationId, userId: input.userId },
    async (tx) => {
      const existing = await tx.queryOne<{ schema_version_id: string }>(
        `SELECT schema_version_id FROM documentation_publications
         WHERE organization_id = ? AND idempotency_key = ?`,
        [input.organizationId, input.idempotencyKey]
      );
      if (existing) {
        const row = await tx.queryOne(
          `SELECT * FROM documentation_schema_versions
           WHERE organization_id = ? AND id = ?`,
          [input.organizationId, existing.schema_version_id]
        );
        return versionFromRow(row!);
      }
      const version = await tx.queryOne<Record<string, unknown>>(
        `SELECT * FROM documentation_schema_versions
         WHERE organization_id = ? AND id = ? AND schema_id = ?`,
        [input.organizationId, input.versionId, input.schemaId]
      );
      if (!version) throw new Error("SCHEMA_VERSION_NOT_FOUND");
      const current = versionFromRow(version);
      if (current.version !== input.expectedVersion) throw new Error("VERSION_CONFLICT");
      if (current.status !== "APPROVED") throw new Error("SCHEMA_NOT_APPROVED");
      const now = new Date().toISOString();
      await tx.execute(
        `UPDATE documentation_schema_versions SET status = 'PUBLISHED',
         published_at = ?, version = version + 1, updated_at = ?
         WHERE organization_id = ? AND id = ? AND version = ?`,
        [now, now, input.organizationId, input.versionId, input.expectedVersion]
      );
      await tx.execute(
        `UPDATE documentation_schema_versions SET status = 'ARCHIVED',
         version = version + 1, updated_at = ?
         WHERE organization_id = ? AND schema_id = ? AND status = 'PUBLISHED' AND id <> ?`,
        [now, input.organizationId, input.schemaId, input.versionId]
      );
      await tx.execute(
        `UPDATE documentation_schemas SET active_version_id = ?, updated_at = ?
         WHERE organization_id = ? AND id = ?`,
        [input.versionId, now, input.organizationId, input.schemaId]
      );
      await tx.execute(
        `INSERT INTO documentation_publications (
          id, organization_id, schema_id, schema_version_id, environment, status,
          idempotency_key, requested_by_user_id, started_at, completed_at, created_at, updated_at
        ) SELECT ?, ?, ?, ?, environment, 'succeeded', ?, ?, ?, ?, ?, ?
          FROM documentation_schemas WHERE organization_id = ? AND id = ?`,
        [
          randomUUID(),
          input.organizationId,
          input.schemaId,
          input.versionId,
          input.idempotencyKey,
          input.userId,
          now,
          now,
          now,
          now,
          input.organizationId,
          input.schemaId,
        ]
      );
      const updated = await tx.queryOne(
        `SELECT * FROM documentation_schema_versions
         WHERE organization_id = ? AND id = ?`,
        [input.organizationId, input.versionId]
      );
      return versionFromRow(updated!);
    }
  );
}

export async function rollbackPublishedVersion(input: {
  organizationId: string;
  userId: string;
  versionId: string;
  expectedVersion: number;
}): Promise<DocumentationSchemaVersion> {
  return withOrganizationTransaction(
    { organizationId: input.organizationId, userId: input.userId },
    async (tx) => {
      const currentRow = await tx.queryOne<Record<string, unknown>>(
        `SELECT * FROM documentation_schema_versions
         WHERE organization_id = ? AND id = ?`,
        [input.organizationId, input.versionId]
      );
      if (!currentRow) throw new Error("SCHEMA_VERSION_NOT_FOUND");
      const current = versionFromRow(currentRow);
      if (current.status !== "PUBLISHED") throw new Error("SCHEMA_NOT_PUBLISHED");
      if (current.version !== input.expectedVersion) throw new Error("VERSION_CONFLICT");
      const previousRow = await tx.queryOne<Record<string, unknown>>(
        `SELECT * FROM documentation_schema_versions
         WHERE organization_id = ? AND schema_id = ? AND status = 'ARCHIVED'
         ORDER BY version_number DESC LIMIT 1`,
        [input.organizationId, current.schemaId]
      );
      if (!previousRow) throw new Error("ROLLBACK_TARGET_NOT_FOUND");
      const previous = versionFromRow(previousRow);
      const now = new Date().toISOString();
      await tx.execute(
        `UPDATE documentation_schema_versions SET status = 'ROLLED_BACK',
         version = version + 1, updated_at = ? WHERE organization_id = ? AND id = ?`,
        [now, input.organizationId, current.id]
      );
      await tx.execute(
        `UPDATE documentation_schema_versions SET status = 'PUBLISHED',
         rollback_of_version_id = ?, published_at = ?, version = version + 1, updated_at = ?
         WHERE organization_id = ? AND id = ?`,
        [current.id, now, now, input.organizationId, previous.id]
      );
      await tx.execute(
        `UPDATE documentation_schemas SET active_version_id = ?, updated_at = ?
         WHERE organization_id = ? AND id = ?`,
        [previous.id, now, input.organizationId, current.schemaId]
      );
      const updated = await tx.queryOne(
        `SELECT * FROM documentation_schema_versions
         WHERE organization_id = ? AND id = ?`,
        [input.organizationId, previous.id]
      );
      return versionFromRow(updated!);
    }
  );
}
