import "server-only";

import { randomUUID } from "node:crypto";

import { db, ensureMigrations } from "@/lib/db/client";
import {
  createChangeRequest,
  markChangeDeploying,
  activateChangeRequest,
  submitChangeRequest,
  ChangeWorkflowError,
} from "@/lib/enterprise/change-workflow";
import type { WorkflowRequestContext } from "@/lib/enterprise/change-workflow";
import {
  createControlPlaneResource,
  findChangeRequest,
  findControlPlaneResource,
  getConfigVersionDetail,
} from "@/lib/enterprise/repository";
import type { ChangeRequestRecord, EnterprisePrincipal } from "@/lib/enterprise/types";
import { getProductDeployment } from "@/lib/deployment/repository";
import type { ProductDeploymentConfiguration } from "@/lib/deployment/types";

export const PROMOTE_COMMIT_ACTION = "promote_commit" as const;

export class CommitSwitchApprovalError extends Error {
  constructor(
    message: string,
    readonly code:
      | "MFA_REQUIRED"
      | "APPROVAL_REQUIRED"
      | "NOT_APPROVED"
      | "PAYLOAD_MISMATCH"
      | "NOT_FOUND"
      | "NOT_READY"
      | "ALREADY_CURRENT"
  ) {
    super(message);
    this.name = "CommitSwitchApprovalError";
  }
}

export interface PromoteCommitConfig {
  action: typeof PROMOTE_COMMIT_ACTION;
  deploymentId: string;
  product: string;
  vercelProjectId: string;
  vercelDeploymentId: string;
  commitSha: string | null;
  fromCommitSha: string | null;
  url: string | null;
}

export function isPromoteCommitConfig(
  config: Record<string, unknown> | null | undefined
): config is PromoteCommitConfig & Record<string, unknown> {
  return config?.action === PROMOTE_COMMIT_ACTION;
}

async function ensureControlPlaneResource(
  deployment: ProductDeploymentConfiguration,
  userId: string
): Promise<string> {
  if (deployment.controlPlaneResourceId) return deployment.controlPlaneResourceId;

  const resource = await createControlPlaneResource({
    organizationId: deployment.organizationId,
    resourceType: "product_deployment",
    name: `${deployment.product}-${deployment.environment}`,
    environment:
      deployment.environment === "production"
        ? "production"
        : deployment.environment === "development"
          ? "development"
          : "staging",
    createdByUserId: userId,
  });

  await db.execute(
    `UPDATE product_deployments SET control_plane_resource_id = ?, updated_at = ?
     WHERE organization_id = ? AND id = ?`,
    [resource.id, new Date().toISOString(), deployment.organizationId, deployment.id]
  );
  return resource.id;
}

export async function proposeCommitSwitch(
  context: WorkflowRequestContext,
  input: {
    deploymentId: string;
    vercelDeploymentId: string;
    commitSha?: string | null;
    fromCommitSha?: string | null;
    url?: string | null;
    idempotencyKey: string;
  }
): Promise<{ changeRequest: ChangeRequestRecord; commitChangeRequestId: string }> {
  ensureMigrations();
  const deployment = await getProductDeployment(
    context.principal.organizationId,
    input.deploymentId
  );
  if (!deployment) {
    throw new CommitSwitchApprovalError("Deployment not found", "NOT_FOUND");
  }

  const vercelDeploymentId = input.vercelDeploymentId.trim();
  if (!vercelDeploymentId) {
    throw new CommitSwitchApprovalError("vercelDeploymentId required", "PAYLOAD_MISMATCH");
  }

  const resourceId = await ensureControlPlaneResource(
    deployment,
    context.principal.userId
  );
  const config: PromoteCommitConfig = {
    action: PROMOTE_COMMIT_ACTION,
    deploymentId: deployment.id,
    product: deployment.product,
    vercelProjectId: deployment.vercelProjectId,
    vercelDeploymentId,
    commitSha: input.commitSha?.trim() || null,
    fromCommitSha: input.fromCommitSha?.trim() || null,
    url: input.url?.trim() || null,
  };
  const diff = {
    operation: PROMOTE_COMMIT_ACTION,
    vercelDeploymentId,
    commitSha: config.commitSha,
    fromCommitSha: config.fromCommitSha,
    environment: deployment.environment,
  };

  const changeRequest = await createChangeRequest(context, {
    resourceId,
    config: { ...config },
    diff,
    idempotencyKey: input.idempotencyKey,
    skipEnvironmentAuthorization: true,
  });
  const submitted =
    changeRequest.state === "DRAFT"
      ? await submitChangeRequest(context, changeRequest.id, changeRequest.version)
      : changeRequest;

  const existingLink = await db.queryOne<{ id: string }>(
    `SELECT id FROM deployment_commit_change_requests
     WHERE organization_id = ? AND change_request_id = ?`,
    [context.principal.organizationId, submitted.id]
  );
  if (existingLink) {
    return { changeRequest: submitted, commitChangeRequestId: existingLink.id };
  }

  const commitChangeId = randomUUID();
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO deployment_commit_change_requests (
      id, organization_id, deployment_id, change_request_id, vercel_deployment_id,
      commit_sha, from_commit_sha, status, version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 1, ?, ?)`,
    [
      commitChangeId,
      context.principal.organizationId,
      deployment.id,
      submitted.id,
      vercelDeploymentId,
      config.commitSha,
      config.fromCommitSha,
      now,
      now,
    ]
  );

  return { changeRequest: submitted, commitChangeRequestId: commitChangeId };
}

function payloadMatches(
  config: Record<string, unknown>,
  input: {
    deploymentId: string;
    vercelDeploymentId: string;
    commitSha?: string | null;
  }
): boolean {
  if (config.action !== PROMOTE_COMMIT_ACTION) return false;
  if (config.deploymentId !== input.deploymentId) return false;
  if (config.vercelDeploymentId !== input.vercelDeploymentId) return false;
  const expectedSha =
    typeof config.commitSha === "string" ? config.commitSha : null;
  const actualSha = input.commitSha?.trim() || null;
  if (expectedSha && actualSha && expectedSha !== actualSha) return false;
  return true;
}

export async function assertApprovedCommitSwitch(input: {
  organizationId: string;
  principal: EnterprisePrincipal;
  changeRequestId: string;
  deploymentId: string;
  vercelDeploymentId: string;
  commitSha?: string | null;
}): Promise<ChangeRequestRecord> {
  ensureMigrations();
  const link = await db.queryOne<{ change_request_id: string; status: string }>(
    `SELECT change_request_id, status FROM deployment_commit_change_requests
     WHERE organization_id = ? AND change_request_id = ? AND deployment_id = ?
       AND vercel_deployment_id = ?`,
    [
      input.organizationId,
      input.changeRequestId,
      input.deploymentId,
      input.vercelDeploymentId,
    ]
  );
  if (!link) {
    throw new CommitSwitchApprovalError(
      "No matching commit switch change request",
      "PAYLOAD_MISMATCH"
    );
  }
  if (link.status === "executed") {
    const change = await findChangeRequest(
      input.organizationId,
      input.changeRequestId
    );
    if (change?.state === "ACTIVE") return change;
  }

  const change = await findChangeRequest(
    input.organizationId,
    input.changeRequestId
  );
  if (!change) {
    throw new CommitSwitchApprovalError("Change request not found", "NOT_FOUND");
  }
  if (change.state !== "APPROVED" && change.state !== "SCHEDULED") {
    throw new CommitSwitchApprovalError(
      `Change request must be approved (current: ${change.state})`,
      "NOT_APPROVED"
    );
  }

  const configVersion = await getConfigVersionDetail(
    input.organizationId,
    change.targetConfigVersionId
  );
  if (!configVersion?.config) {
    throw new CommitSwitchApprovalError("Change config missing", "PAYLOAD_MISMATCH");
  }
  if (
    !payloadMatches(configVersion.config, {
      deploymentId: input.deploymentId,
      vercelDeploymentId: input.vercelDeploymentId,
      commitSha: input.commitSha,
    })
  ) {
    throw new CommitSwitchApprovalError(
      "Change request payload does not match this switch",
      "PAYLOAD_MISMATCH"
    );
  }

  return change;
}

export async function finalizeCommitSwitchChangeRequest(
  context: WorkflowRequestContext,
  changeRequest: ChangeRequestRecord,
  deployment: ProductDeploymentConfiguration
): Promise<void> {
  try {
    const resource = deployment.controlPlaneResourceId
      ? await findControlPlaneResource(
          context.principal.organizationId,
          deployment.controlPlaneResourceId
        )
      : null;
    const expectedResourceVersion = resource?.version ?? deployment.version;

    const deploying = await markChangeDeploying(
      context,
      changeRequest.id,
      changeRequest.version
    );
    const configVersion = await getConfigVersionDetail(
      context.principal.organizationId,
      changeRequest.targetConfigVersionId
    );
    if (!configVersion) return;

    await activateChangeRequest(context, {
      id: deploying.id,
      expectedVersion: deploying.version,
      expectedResourceVersion,
    });

    await db.execute(
      `UPDATE deployment_commit_change_requests
       SET status = 'executed', updated_at = ?, version = version + 1
       WHERE organization_id = ? AND change_request_id = ?`,
      [new Date().toISOString(), context.principal.organizationId, changeRequest.id]
    );
  } catch (error) {
    await db.execute(
      `UPDATE deployment_commit_change_requests
       SET status = 'failed', updated_at = ?, version = version + 1
       WHERE organization_id = ? AND change_request_id = ? AND status = 'pending'`,
      [new Date().toISOString(), context.principal.organizationId, changeRequest.id]
    );
    if (error instanceof ChangeWorkflowError) {
      throw new CommitSwitchApprovalError(error.message, "NOT_APPROVED");
    }
    throw error;
  }
}

export interface PendingCommitSwitchLink {
  id: string;
  changeRequestId: string;
  deploymentId: string;
  vercelDeploymentId: string;
  commitSha: string | null;
  fromCommitSha: string | null;
  status: string;
  changeState: string | null;
}

export async function listPendingCommitSwitches(
  organizationId: string,
  deploymentId?: string
): Promise<PendingCommitSwitchLink[]> {
  ensureMigrations();
  const rows = deploymentId
    ? await db.query<Record<string, unknown>>(
        `SELECT l.id, l.change_request_id, l.deployment_id, l.vercel_deployment_id,
                l.commit_sha, l.from_commit_sha, l.status, c.state AS change_state
         FROM deployment_commit_change_requests l
         LEFT JOIN change_requests c
           ON c.organization_id = l.organization_id AND c.id = l.change_request_id
         WHERE l.organization_id = ? AND l.deployment_id = ?
           AND l.status IN ('pending')
           AND (c.state IS NULL OR c.state IN ('PENDING_REVIEW','APPROVED','SCHEDULED'))
         ORDER BY l.created_at DESC`,
        [organizationId, deploymentId]
      )
    : await db.query<Record<string, unknown>>(
        `SELECT l.id, l.change_request_id, l.deployment_id, l.vercel_deployment_id,
                l.commit_sha, l.from_commit_sha, l.status, c.state AS change_state
         FROM deployment_commit_change_requests l
         LEFT JOIN change_requests c
           ON c.organization_id = l.organization_id AND c.id = l.change_request_id
         WHERE l.organization_id = ?
           AND l.status IN ('pending')
           AND (c.state IS NULL OR c.state IN ('PENDING_REVIEW','APPROVED','SCHEDULED'))
         ORDER BY l.created_at DESC`,
        [organizationId]
      );

  return rows.map((row) => ({
    id: String(row.id),
    changeRequestId: String(row.change_request_id),
    deploymentId: String(row.deployment_id),
    vercelDeploymentId: String(row.vercel_deployment_id),
    commitSha: row.commit_sha == null ? null : String(row.commit_sha),
    fromCommitSha: row.from_commit_sha == null ? null : String(row.from_commit_sha),
    status: String(row.status),
    changeState: row.change_state == null ? null : String(row.change_state),
  }));
}

export async function findLatestPromoteAuditSha(
  organizationId: string,
  deploymentId: string
): Promise<string | null> {
  ensureMigrations();
  const row = await db.queryOne<{ payload_json: string }>(
    `SELECT payload_json FROM deployment_audit_events
     WHERE organization_id = ? AND deployment_id = ?
       AND event_type IN ('deployment_promote','commit_switch_executed','deployment_rollback')
     ORDER BY created_at DESC
     LIMIT 1`,
    [organizationId, deploymentId]
  );
  if (!row?.payload_json) return null;
  try {
    const payload = JSON.parse(row.payload_json) as { commitSha?: string };
    return typeof payload.commitSha === "string" && payload.commitSha.trim()
      ? payload.commitSha.trim()
      : null;
  } catch {
    return null;
  }
}
