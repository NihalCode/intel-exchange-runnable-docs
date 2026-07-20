import "server-only";

import { randomUUID } from "node:crypto";

import { db, withOrganizationTransaction } from "@/lib/db/client";
import {
  normalizeHostname,
  validateDomainMappingInput,
} from "@/lib/domains/normalize";
import type {
  DomainCollectionMapping,
  DomainEnvironment,
  DomainKind,
  DomainMappingInput,
  ResolvedHostContext,
  TlsStatus,
  VerificationStatus,
} from "@/lib/domains/types";
import { isProductKey } from "@/lib/products/registry";

/** Placeholder when a value is intentionally not persisted (mirrors credentials repository). */
export const NOT_STORED = "not stored";

export class DomainMappingNotFoundError extends Error {
  constructor(message = "Domain mapping not found") {
    super(message);
    this.name = "DomainMappingNotFoundError";
  }
}

export class DomainMappingVersionConflictError extends Error {
  constructor(message = "Domain mapping version conflict") {
    super(message);
    this.name = "DomainMappingVersionConflictError";
  }
}

function fromRow(row: Record<string, unknown>): DomainCollectionMapping {
  const productIdRaw = row.product_id == null ? null : String(row.product_id);
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    hostname: String(row.hostname),
    kind: row.kind as DomainKind,
    productId: productIdRaw && isProductKey(productIdRaw) ? productIdRaw : null,
    collectionId: row.collection_id == null ? null : String(row.collection_id),
    environment: row.environment as DomainEnvironment,
    isPrimary: Boolean(row.is_primary),
    enabled: Boolean(row.enabled),
    verificationStatus: row.verification_status as VerificationStatus,
    tlsStatus: row.tls_status as TlsStatus,
    version: Number(row.version),
    createdByUserId: String(row.created_by_user_id),
    updatedByUserId: String(row.updated_by_user_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function listDomainMappings(
  organizationId: string
): Promise<DomainCollectionMapping[]> {
  const rows = await db.query(
    `SELECT * FROM domain_collection_mappings
     WHERE organization_id = ?
     ORDER BY hostname ASC`,
    [organizationId]
  );
  return rows.map(fromRow);
}

export async function findDomainMappingById(
  organizationId: string,
  id: string
): Promise<DomainCollectionMapping | null> {
  const row = await db.queryOne(
    `SELECT * FROM domain_collection_mappings
     WHERE organization_id = ? AND id = ?`,
    [organizationId, id]
  );
  return row ? fromRow(row) : null;
}

export async function findDomainMappingByHostname(
  organizationId: string,
  hostname: string
): Promise<DomainCollectionMapping | null> {
  const normalized = normalizeHostname(hostname);
  if (!normalized.ok) return null;
  const row = await db.queryOne(
    `SELECT * FROM domain_collection_mappings
     WHERE organization_id = ? AND hostname = ?`,
    [organizationId, normalized.hostname]
  );
  return row ? fromRow(row) : null;
}

/** Global lookup for verified active mappings (used by host resolver). */
export async function findActiveVerifiedDomainMappingByHostname(
  hostname: string
): Promise<DomainCollectionMapping | null> {
  const normalized = normalizeHostname(hostname);
  if (!normalized.ok) return null;
  const row = await db.queryOne(
    `SELECT * FROM domain_collection_mappings
     WHERE hostname = ? AND enabled = ? AND verification_status = 'verified'
     ORDER BY is_primary DESC, updated_at DESC
     LIMIT 1`,
    [normalized.hostname, 1]
  );
  return row ? fromRow(row) : null;
}

export async function createDomainMapping(input: {
  organizationId: string;
  userId: string;
  mapping: DomainMappingInput;
}): Promise<DomainCollectionMapping> {
  const validationError = validateDomainMappingInput(input.mapping);
  if (validationError) throw new Error(validationError.message);

  const normalized = normalizeHostname(input.mapping.hostname);
  if (!normalized.ok) throw new Error(normalized.error.message);

  return withOrganizationTransaction(
    { organizationId: input.organizationId, userId: input.userId },
    async (tx) => {
      const duplicate = await tx.queryOne(
        `SELECT id FROM domain_collection_mappings
         WHERE organization_id = ? AND hostname = ?`,
        [input.organizationId, normalized.hostname]
      );
      if (duplicate) {
        throw new Error("A mapping for this hostname already exists in the organization.");
      }

      const id = randomUUID();
      const now = new Date().toISOString();
      const productId =
        input.mapping.kind === "product" ? (input.mapping.productId ?? null) : null;
      const collectionId =
        input.mapping.kind === "product"
          ? (input.mapping.collectionId?.trim() ?? null)
          : null;

      await tx.execute(
        `INSERT INTO domain_collection_mappings (
          id, organization_id, hostname, kind, product_id, collection_id,
          environment, is_primary, enabled, verification_status, tls_status,
          version, created_by_user_id, updated_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
        [
          id,
          input.organizationId,
          normalized.hostname,
          input.mapping.kind,
          productId,
          collectionId,
          input.mapping.environment,
          Boolean(input.mapping.isPrimary),
          input.mapping.enabled !== false,
          input.mapping.verificationStatus ?? "pending",
          input.mapping.tlsStatus ?? "pending",
          input.userId,
          input.userId,
          now,
          now,
        ]
      );

      const saved = await tx.queryOne(
        `SELECT * FROM domain_collection_mappings WHERE organization_id = ? AND id = ?`,
        [input.organizationId, id]
      );
      return fromRow(saved!);
    }
  );
}

export async function updateDomainMapping(input: {
  organizationId: string;
  userId: string;
  id: string;
  expectedVersion: number;
  patch: Partial<DomainMappingInput> & {
    verificationStatus?: VerificationStatus;
    tlsStatus?: TlsStatus;
  };
}): Promise<DomainCollectionMapping> {
  return withOrganizationTransaction(
    { organizationId: input.organizationId, userId: input.userId },
    async (tx) => {
      const current = await tx.queryOne(
        `SELECT * FROM domain_collection_mappings
         WHERE organization_id = ? AND id = ?`,
        [input.organizationId, input.id]
      );
      if (!current) throw new DomainMappingNotFoundError();
      const existing = fromRow(current);
      if (existing.version !== input.expectedVersion) {
        throw new DomainMappingVersionConflictError();
      }

      const merged: DomainMappingInput = {
        hostname: input.patch.hostname ?? existing.hostname,
        kind: input.patch.kind ?? existing.kind,
        productId: input.patch.productId !== undefined ? input.patch.productId : existing.productId,
        collectionId:
          input.patch.collectionId !== undefined
            ? input.patch.collectionId
            : existing.collectionId,
        environment: input.patch.environment ?? existing.environment,
        isPrimary: input.patch.isPrimary ?? existing.isPrimary,
        enabled: input.patch.enabled ?? existing.enabled,
        verificationStatus: input.patch.verificationStatus ?? existing.verificationStatus,
        tlsStatus: input.patch.tlsStatus ?? existing.tlsStatus,
      };

      const validationError = validateDomainMappingInput(merged);
      if (validationError) throw new Error(validationError.message);

      const normalized = normalizeHostname(merged.hostname);
      if (!normalized.ok) throw new Error(normalized.error.message);

      if (normalized.hostname !== existing.hostname) {
        const duplicate = await tx.queryOne(
          `SELECT id FROM domain_collection_mappings
           WHERE organization_id = ? AND hostname = ? AND id <> ?`,
          [input.organizationId, normalized.hostname, input.id]
        );
        if (duplicate) {
          throw new Error("A mapping for this hostname already exists in the organization.");
        }
      }

      const productId = merged.kind === "product" ? (merged.productId ?? null) : null;
      const collectionId =
        merged.kind === "product" ? (merged.collectionId?.trim() ?? null) : null;
      const now = new Date().toISOString();

      await tx.execute(
        `UPDATE domain_collection_mappings SET
          hostname = ?, kind = ?, product_id = ?, collection_id = ?,
          environment = ?, is_primary = ?, enabled = ?,
          verification_status = ?, tls_status = ?,
          updated_by_user_id = ?, version = version + 1, updated_at = ?
         WHERE organization_id = ? AND id = ? AND version = ?`,
        [
          normalized.hostname,
          merged.kind,
          productId,
          collectionId,
          merged.environment,
          Boolean(merged.isPrimary),
          Boolean(merged.enabled),
          merged.verificationStatus ?? "pending",
          merged.tlsStatus ?? "pending",
          input.userId,
          now,
          input.organizationId,
          input.id,
          input.expectedVersion,
        ]
      );

      const saved = await tx.queryOne(
        `SELECT * FROM domain_collection_mappings WHERE organization_id = ? AND id = ?`,
        [input.organizationId, input.id]
      );
      const updated = fromRow(saved!);
      if (updated.version !== input.expectedVersion + 1) {
        throw new DomainMappingVersionConflictError();
      }
      return updated;
    }
  );
}

export async function deleteDomainMapping(input: {
  organizationId: string;
  userId: string;
  id: string;
  expectedVersion: number;
}): Promise<boolean> {
  return withOrganizationTransaction(
    { organizationId: input.organizationId, userId: input.userId },
    async (tx) => {
      const current = await tx.queryOne<{ version: number }>(
        `SELECT version FROM domain_collection_mappings
         WHERE organization_id = ? AND id = ?`,
        [input.organizationId, input.id]
      );
      if (!current) return false;
      if (Number(current.version) !== input.expectedVersion) {
        throw new DomainMappingVersionConflictError();
      }

      await tx.execute(
        `DELETE FROM domain_collection_mappings
         WHERE organization_id = ? AND id = ? AND version = ?`,
        [input.organizationId, input.id, input.expectedVersion]
      );
      return true;
    }
  );
}

export function toResolvedHostContextFromMapping(
  mapping: DomainCollectionMapping
): ResolvedHostContext {
  return {
    hostname: mapping.hostname,
    organizationId: mapping.organizationId,
    domainKind: mapping.kind,
    productId: mapping.productId,
    collectionId: mapping.collectionId,
    environment: mapping.environment,
    mappingId: mapping.id,
    fromEnvConfig: false,
  };
}
