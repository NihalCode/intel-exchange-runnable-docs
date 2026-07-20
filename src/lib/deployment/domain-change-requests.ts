import "server-only";

import { randomUUID } from "node:crypto";

import { db, withOrganizationTransaction } from "@/lib/db/client";
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
  findControlPlaneResourceByDeploymentKey,
  getConfigVersionDetail,
} from "@/lib/enterprise/repository";
import type { ChangeRequestRecord, EnterprisePrincipal } from "@/lib/enterprise/types";
import { getProductDeployment } from "@/lib/deployment/repository";
import type { ProductDeploymentConfiguration } from "@/lib/deployment/types";

export type DomainMutationAction = "add" | "remove" | "verify";

export class DomainMutationApprovalError extends Error {
  constructor(
    message: string,
    readonly code:
      | "MFA_REQUIRED"
      | "APPROVAL_REQUIRED"
      | "NOT_APPROVED"
      | "PAYLOAD_MISMATCH"
      | "NOT_FOUND"
  ) {
    super(message);
    this.name = "DomainMutationApprovalError";
  }
}

export function isProductionDomainMutation(
  deployment: ProductDeploymentConfiguration,
  action?: string
): boolean {
  if (deployment.environment !== "production") return false;
  const mutating = action === "remove" || action === "add" || action === "verify" || !action;
  return mutating;
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

export async function proposeProductionDomainMutation(
  context: WorkflowRequestContext,
  input: {
    deploymentId: string;
    domain: string;
    action: DomainMutationAction;
    idempotencyKey: string;
  }
): Promise<{ changeRequest: ChangeRequestRecord; domainChangeRequestId: string }> {
  const deployment = await getProductDeployment(
    context.principal.organizationId,
    input.deploymentId
  );
  if (!deployment) {
    throw new DomainMutationApprovalError("Deployment not found", "NOT_FOUND");
  }
  if (!isProductionDomainMutation(deployment, input.action)) {
    throw new DomainMutationApprovalError(
      "Change request approval applies to production domain mutations only",
      "NOT_FOUND"
    );
  }

  const resourceId = await ensureControlPlaneResource(deployment, context.principal.userId);
  const config = {
    deploymentId: deployment.id,
    product: deployment.product,
    domain: input.domain,
    action: input.action,
    vercelProjectId: deployment.vercelProjectId,
  };
  const diff = {
    operation: input.action,
    domain: input.domain,
    environment: deployment.environment,
  };

  const changeRequest = await createChangeRequest(context, {
    resourceId,
    config,
    diff,
    idempotencyKey: input.idempotencyKey,
  });
  const submitted = await submitChangeRequest(
    context,
    changeRequest.id,
    changeRequest.version
  );

  const domainChangeId = randomUUID();
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO deployment_domain_change_requests (
      id, organization_id, deployment_id, change_request_id, domain, action, status,
      version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 1, ?, ?)`,
    [
      domainChangeId,
      context.principal.organizationId,
      deployment.id,
      submitted.id,
      input.domain,
      input.action,
      now,
      now,
    ]
  );

  return { changeRequest: submitted, domainChangeRequestId: domainChangeId };
}

function mutationPayloadMatches(
  config: Record<string, unknown>,
  input: { deploymentId: string; domain: string; action: DomainMutationAction }
): boolean {
  return (
    config.deploymentId === input.deploymentId &&
    config.domain === input.domain &&
    config.action === input.action
  );
}

export async function assertApprovedProductionDomainMutation(input: {
  organizationId: string;
  principal: EnterprisePrincipal;
  changeRequestId: string;
  deploymentId: string;
  domain: string;
  action: DomainMutationAction;
}): Promise<ChangeRequestRecord> {
  const link = await db.queryOne<{ change_request_id: string; status: string }>(
    `SELECT change_request_id, status FROM deployment_domain_change_requests
     WHERE organization_id = ? AND change_request_id = ? AND deployment_id = ?
       AND domain = ? AND action = ?`,
    [
      input.organizationId,
      input.changeRequestId,
      input.deploymentId,
      input.domain,
      input.action,
    ]
  );
  if (!link) {
    throw new DomainMutationApprovalError(
      "No matching domain change request",
      "PAYLOAD_MISMATCH"
    );
  }

  const change = await findChangeRequest(input.organizationId, input.changeRequestId);
  if (!change) {
    throw new DomainMutationApprovalError("Change request not found", "NOT_FOUND");
  }
  if (change.state !== "APPROVED" && change.state !== "SCHEDULED") {
    throw new DomainMutationApprovalError(
      `Change request must be approved (current: ${change.state})`,
      "NOT_APPROVED"
    );
  }

  const configVersion = await getConfigVersionDetail(
    input.organizationId,
    change.targetConfigVersionId
  );
  if (!configVersion?.config) {
    throw new DomainMutationApprovalError("Change config missing", "PAYLOAD_MISMATCH");
  }
  const config = configVersion.config;
  if (
    !mutationPayloadMatches(config, {
      deploymentId: input.deploymentId,
      domain: input.domain,
      action: input.action,
    })
  ) {
    throw new DomainMutationApprovalError(
      "Change request payload does not match this mutation",
      "PAYLOAD_MISMATCH"
    );
  }

  return change;
}

export async function finalizeDomainMutationChangeRequest(
  context: WorkflowRequestContext,
  changeRequest: ChangeRequestRecord,
  deployment: ProductDeploymentConfiguration
): Promise<void> {
  try {
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
      expectedResourceVersion: deployment.version,
    });

    await db.execute(
      `UPDATE deployment_domain_change_requests
       SET status = 'executed', updated_at = ?, version = version + 1
       WHERE organization_id = ? AND change_request_id = ?`,
      [new Date().toISOString(), context.principal.organizationId, changeRequest.id]
    );
  } catch (error) {
    if (error instanceof ChangeWorkflowError) {
      throw new DomainMutationApprovalError(error.message, "NOT_APPROVED");
    }
    throw error;
  }
}
