import "server-only";

import { randomUUID } from "node:crypto";

import { db, withOrganizationTransaction } from "@/lib/db/client";
import { normalizeHostname } from "@/lib/domains/normalize";
import { validateCollectionForProduct } from "@/lib/deployment/postman-collection-registry";
import type {
  DomainAutomationRecord,
  DomainWorkflowState,
  ProductDeploymentConfiguration,
  ProductDeploymentInput,
} from "@/lib/deployment/types";
import { isProductKey, type ProductKey } from "@/lib/products/registry";

function parseJsonArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  try {
    const parsed = JSON.parse(String(raw ?? "[]"));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function fromDeploymentRow(row: Record<string, unknown>): ProductDeploymentConfiguration {
  const productId = String(row.product_id);
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    product: isProductKey(productId) ? productId : "ctix",
    postmanCollectionId: String(row.postman_collection_id),
    postmanCollectionVersion:
      row.postman_collection_version == null ? null : String(row.postman_collection_version),
    vercelTeamId: String(row.vercel_team_id),
    vercelProjectId: String(row.vercel_project_id),
    vercelProjectName: String(row.vercel_project_name),
    environment: row.environment as ProductDeploymentConfiguration["environment"],
    primaryDomain: row.primary_domain == null ? null : String(row.primary_domain),
    additionalDomains: parseJsonArray(row.additional_domains_json),
    enabled: Boolean(row.enabled),
    status: row.status as ProductDeploymentConfiguration["status"],
    controlPlaneResourceId:
      row.control_plane_resource_id == null ? null : String(row.control_plane_resource_id),
    version: Number(row.version),
    createdByUserId: String(row.created_by_user_id),
    updatedByUserId: String(row.updated_by_user_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function fromDomainRow(row: Record<string, unknown>): DomainAutomationRecord {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    deploymentId: String(row.deployment_id),
    domain: String(row.domain),
    workflowState: row.workflow_state as DomainWorkflowState,
    vercelDomainId: row.vercel_domain_id == null ? null : String(row.vercel_domain_id),
    dnsRequirementsJson: String(row.dns_requirements_json ?? "[]"),
    lastDnsCheckJson: row.last_dns_check_json == null ? null : String(row.last_dns_check_json),
    lastDnsCheckAt: row.last_dns_check_at == null ? null : String(row.last_dns_check_at),
    dnsRetryCount: Number(row.dns_retry_count ?? 0),
    tlsStatus: row.tls_status as DomainAutomationRecord["tlsStatus"],
    lastProviderError: row.last_provider_error == null ? null : String(row.last_provider_error),
    isPrimary: Boolean(row.is_primary),
    enabled: Boolean(row.enabled),
    version: Number(row.version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function listProductDeployments(
  organizationId: string
): Promise<ProductDeploymentConfiguration[]> {
  const rows = await db.query(
    `SELECT * FROM product_deployments WHERE organization_id = ? ORDER BY product_id ASC`,
    [organizationId]
  );
  return rows.map(fromDeploymentRow);
}

export async function getProductDeployment(
  organizationId: string,
  id: string
): Promise<ProductDeploymentConfiguration | null> {
  const row = await db.queryOne(
    `SELECT * FROM product_deployments WHERE organization_id = ? AND id = ?`,
    [organizationId, id]
  );
  return row ? fromDeploymentRow(row) : null;
}

export async function createProductDeployment(input: {
  organizationId: string;
  userId: string;
  config: ProductDeploymentInput;
}): Promise<ProductDeploymentConfiguration> {
  if (!validateCollectionForProduct(input.config.product, input.config.postmanCollectionId)) {
    throw new Error("Postman collection does not match approved registry for this product");
  }

  return withOrganizationTransaction(
    { organizationId: input.organizationId, userId: input.userId },
    async (tx) => {
      const id = randomUUID();
      const now = new Date().toISOString();
      await tx.execute(
        `INSERT INTO product_deployments (
          id, organization_id, product_id, postman_collection_id, postman_collection_version,
          vercel_team_id, vercel_project_id, vercel_project_name, environment,
          primary_domain, additional_domains_json, enabled, status, version,
          created_by_user_id, updated_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
        [
          id,
          input.organizationId,
          input.config.product,
          input.config.postmanCollectionId,
          input.config.postmanCollectionVersion ?? null,
          input.config.vercelTeamId,
          input.config.vercelProjectId,
          input.config.vercelProjectName,
          input.config.environment,
          input.config.primaryDomain ?? null,
          JSON.stringify(input.config.additionalDomains ?? []),
          input.config.enabled === false ? 0 : 1,
          input.config.status ?? "configuring",
          input.userId,
          input.userId,
          now,
          now,
        ]
      );
      const row = await tx.queryOne(`SELECT * FROM product_deployments WHERE id = ?`, [id]);
      return fromDeploymentRow(row!);
    }
  );
}

export async function listDomainAutomationRecords(
  organizationId: string,
  deploymentId: string
): Promise<DomainAutomationRecord[]> {
  const rows = await db.query(
    `SELECT * FROM domain_automation_records
     WHERE organization_id = ? AND deployment_id = ?
     ORDER BY is_primary DESC, domain ASC`,
    [organizationId, deploymentId]
  );
  return rows.map(fromDomainRow);
}

export async function upsertDomainAutomationRecord(input: {
  organizationId: string;
  deploymentId: string;
  domain: string;
  workflowState: DomainWorkflowState;
  dnsRequirementsJson?: string;
  lastDnsCheckJson?: string | null;
  tlsStatus?: DomainAutomationRecord["tlsStatus"];
  lastProviderError?: string | null;
  isPrimary?: boolean;
}): Promise<DomainAutomationRecord> {
  const normalized = normalizeHostname(input.domain);
  if (!normalized.ok) throw new Error(normalized.error.message);

  const existing = await db.queryOne(
    `SELECT * FROM domain_automation_records
     WHERE organization_id = ? AND domain = ?`,
    [input.organizationId, normalized.hostname]
  );
  const now = new Date().toISOString();

  if (existing) {
    await db.execute(
      `UPDATE domain_automation_records SET
        workflow_state = ?, dns_requirements_json = COALESCE(?, dns_requirements_json),
        last_dns_check_json = ?, last_dns_check_at = ?, dns_retry_count = dns_retry_count + 1,
        tls_status = COALESCE(?, tls_status), last_provider_error = ?,
        is_primary = COALESCE(?, is_primary), updated_at = ?, version = version + 1
       WHERE id = ?`,
      [
        input.workflowState,
        input.dnsRequirementsJson ?? null,
        input.lastDnsCheckJson ?? null,
        input.lastDnsCheckJson ? now : null,
        input.tlsStatus ?? null,
        input.lastProviderError ?? null,
        input.isPrimary == null ? null : Boolean(input.isPrimary),
        now,
        existing.id,
      ]
    );
    const row = await db.queryOne(`SELECT * FROM domain_automation_records WHERE id = ?`, [
      existing.id,
    ]);
    return fromDomainRow(row!);
  }

  const id = randomUUID();
  await db.execute(
    `INSERT INTO domain_automation_records (
      id, organization_id, deployment_id, domain, workflow_state,
      dns_requirements_json, last_dns_check_json, last_dns_check_at,
      tls_status, last_provider_error, is_primary, enabled, version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [
      id,
      input.organizationId,
      input.deploymentId,
      normalized.hostname,
      input.workflowState,
      input.dnsRequirementsJson ?? "[]",
      input.lastDnsCheckJson ?? null,
      input.lastDnsCheckJson ? now : null,
      input.tlsStatus ?? "pending",
      input.lastProviderError ?? null,
      Boolean(input.isPrimary),
      true,
      now,
      now,
    ]
  );
  const row = await db.queryOne(`SELECT * FROM domain_automation_records WHERE id = ?`, [id]);
  return fromDomainRow(row!);
}

export async function recordDeploymentAuditEvent(input: {
  organizationId: string;
  deploymentId?: string | null;
  domain?: string | null;
  eventType: string;
  actorUserId?: string | null;
  payload?: Record<string, unknown>;
  requestId?: string | null;
}): Promise<void> {
  await db.execute(
    `INSERT INTO deployment_audit_events (
      id, organization_id, deployment_id, domain, event_type, actor_user_id, payload_json, request_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      input.organizationId,
      input.deploymentId ?? null,
      input.domain ?? null,
      input.eventType,
      input.actorUserId ?? null,
      JSON.stringify(input.payload ?? {}),
      input.requestId ?? null,
      new Date().toISOString(),
    ]
  );
}

export function maskProjectId(projectId: string): string {
  if (projectId.length <= 8) return "****";
  return `${projectId.slice(0, 4)}…${projectId.slice(-4)}`;
}

export function productKeyFromDeployment(
  deployment: ProductDeploymentConfiguration
): ProductKey {
  return deployment.product;
}
