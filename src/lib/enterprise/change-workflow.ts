import "server-only";

import { createHash, randomUUID } from "node:crypto";

import {
  type DbExecutor,
  withOrganizationTransaction,
} from "@/lib/db/client";
import { appendEnterpriseAuditEvent } from "@/lib/enterprise/audit";
import {
  authorizeEnterprise,
  requireEnterprisePermission,
} from "@/lib/enterprise/policy";
import { ENTERPRISE_AUDIT_ACTIONS } from "@/lib/enterprise/observability";
import {
  activateResourceVersion,
  addChangeApproval,
  createChangeRequestRecord,
  createConfigVersion,
  findChangeRequest,
  findConfigVersion,
  findControlPlaneResource,
  transitionChangeRequest,
} from "@/lib/enterprise/repository";
import type {
  ChangeRequestRecord,
  ChangeRequestState,
  EnterprisePrincipal,
} from "@/lib/enterprise/types";
import { redactStructuredValue } from "@/lib/enterprise/observability";

export interface WorkflowRequestContext {
  principal: EnterprisePrincipal;
  correlationId: string;
  requestId?: string;
}

export class ChangeWorkflowError extends Error {
  constructor(
    message: string,
    readonly code:
      | "NOT_FOUND"
      | "INVALID_TRANSITION"
      | "SELF_APPROVAL"
      | "IDEMPOTENCY_CONFLICT"
  ) {
    super(message);
    this.name = "ChangeWorkflowError";
  }
}

function requestHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function auditTransition(
  executor: DbExecutor,
  context: WorkflowRequestContext,
  request: ChangeRequestRecord,
  action: string,
  from: ChangeRequestState | null
): Promise<void> {
  await appendEnterpriseAuditEvent(
    {
      organizationId: request.organizationId,
      actorUserId: context.principal.userId,
      action,
      resourceType: "change_request",
      resourceId: request.id,
      outcome: "success",
      correlationId: context.correlationId,
      requestId: context.requestId,
      metadata: { from, to: request.state, version: request.version },
    },
    executor
  );
}

async function requireRequest(
  organizationId: string,
  id: string,
  executor: DbExecutor
): Promise<ChangeRequestRecord> {
  const request = await findChangeRequest(organizationId, id, executor);
  if (!request) {
    throw new ChangeWorkflowError("Change request was not found", "NOT_FOUND");
  }
  return request;
}

async function transition(
  context: WorkflowRequestContext,
  input: {
    id: string;
    expectedVersion: number;
    allowedFrom: readonly ChangeRequestState[];
    to: ChangeRequestState;
    action: string;
    approvedByUserId?: string;
    scheduledFor?: string;
    activatedAt?: string;
  },
  executor: DbExecutor
): Promise<ChangeRequestRecord> {
  const current = await requireRequest(
    context.principal.organizationId,
    input.id,
    executor
  );
  if (!input.allowedFrom.includes(current.state)) {
    throw new ChangeWorkflowError(
      `Cannot transition ${current.state} to ${input.to}`,
      "INVALID_TRANSITION"
    );
  }
  const updated = await transitionChangeRequest(
    {
      organizationId: context.principal.organizationId,
      id: input.id,
      expectedVersion: input.expectedVersion,
      from: current.state,
      to: input.to,
      approvedByUserId: input.approvedByUserId,
      scheduledFor: input.scheduledFor,
      activatedAt: input.activatedAt,
    },
    executor
  );
  await auditTransition(executor, context, updated, input.action, current.state);
  return updated;
}

export async function createChangeRequest(
  context: WorkflowRequestContext,
  input: {
    resourceId: string;
    config: Record<string, unknown>;
    diff: Record<string, unknown>;
    idempotencyKey: string;
    /**
     * Propose-only path for promote_commit: developers may create CRs against
     * production product_deployment resources without the production write gate.
     * Execute still requires deployments.manage.
     */
    skipEnvironmentAuthorization?: boolean;
  }
): Promise<ChangeRequestRecord> {
  if (!input.idempotencyKey.trim()) {
    throw new ChangeWorkflowError(
      "An idempotency key is required",
      "IDEMPOTENCY_CONFLICT"
    );
  }
  return withOrganizationTransaction(
    {
      organizationId: context.principal.organizationId,
      userId: context.principal.userId,
    },
    async (transaction) => {
      const hash = requestHash({
        resourceId: input.resourceId,
        config: input.config,
        diff: input.diff,
      });
      const existing = await transaction.queryOne<{
        request_hash: string;
        resource_id: string | null;
      }>(
        `SELECT request_hash, resource_id FROM idempotency_keys
         WHERE organization_id = ? AND operation = 'change_request.create'
           AND key_value = ? LIMIT 1`,
        [context.principal.organizationId, input.idempotencyKey]
      );
      if (existing) {
        if (existing.request_hash !== hash || !existing.resource_id) {
          throw new ChangeWorkflowError(
            "The idempotency key was reused with different input",
            "IDEMPOTENCY_CONFLICT"
          );
        }
        return requireRequest(
          context.principal.organizationId,
          existing.resource_id,
          transaction
        );
      }

      const resource = await findControlPlaneResource(
        context.principal.organizationId,
        input.resourceId,
        transaction
      );
      if (!resource) {
        throw new ChangeWorkflowError("Resource was not found", "NOT_FOUND");
      }
      requireEnterprisePermission(
        context.principal,
        "changes.create",
        input.skipEnvironmentAuthorization
          ? { organizationId: resource.organizationId }
          : {
              organizationId: resource.organizationId,
              environment: resource.environment,
            }
      );

      const version = await createConfigVersion(
        {
          organizationId: context.principal.organizationId,
          resourceId: resource.id,
          config: input.config,
          sanitizedDiff: redactStructuredValue(input.diff),
          createdByUserId: context.principal.userId,
        },
        transaction
      );
      const request = await createChangeRequestRecord(
        {
          organizationId: context.principal.organizationId,
          resourceId: resource.id,
          targetConfigVersionId: version.id,
          requestedByUserId: context.principal.userId,
          idempotencyKey: input.idempotencyKey,
        },
        transaction
      );
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await transaction.execute(
        `INSERT INTO idempotency_keys (
          id, organization_id, key_value, operation, request_hash, resource_id,
          expires_at, created_at
        ) VALUES (?, ?, ?, 'change_request.create', ?, ?, ?, ?)`,
        [
          randomUUID(),
          context.principal.organizationId,
          input.idempotencyKey,
          hash,
          request.id,
          expiresAt,
          new Date().toISOString(),
        ]
      );
      await auditTransition(
        transaction,
        context,
        request,
        ENTERPRISE_AUDIT_ACTIONS.changeCreated,
        null
      );
      return request;
    }
  );
}

export async function submitChangeRequest(
  context: WorkflowRequestContext,
  id: string,
  expectedVersion: number
): Promise<ChangeRequestRecord> {
  requireEnterprisePermission(context.principal, "changes.submit", {
    organizationId: context.principal.organizationId,
  });
  return withOrganizationTransaction(
    {
      organizationId: context.principal.organizationId,
      userId: context.principal.userId,
    },
    (transaction) =>
      transition(
        context,
        {
          id,
          expectedVersion,
          allowedFrom: ["DRAFT"],
          to: "PENDING_REVIEW",
          action: ENTERPRISE_AUDIT_ACTIONS.changeSubmitted,
        },
        transaction
      )
  );
}

export async function reviewChangeRequest(
  context: WorkflowRequestContext,
  input: {
    id: string;
    expectedVersion: number;
    decision: "APPROVED" | "REJECTED";
    comment?: string;
  }
): Promise<ChangeRequestRecord> {
  requireEnterprisePermission(context.principal, "changes.approve", {
    organizationId: context.principal.organizationId,
  });
  return withOrganizationTransaction(
    {
      organizationId: context.principal.organizationId,
      userId: context.principal.userId,
    },
    async (transaction) => {
      const current = await requireRequest(
        context.principal.organizationId,
        input.id,
        transaction
      );
      if (current.requestedByUserId === context.principal.userId) {
        throw new ChangeWorkflowError(
          "Requesters cannot approve their own changes",
          "SELF_APPROVAL"
        );
      }
      await addChangeApproval(
        {
          organizationId: context.principal.organizationId,
          changeRequestId: input.id,
          approverUserId: context.principal.userId,
          decision: input.decision,
          comment: input.comment,
        },
        transaction
      );
      return transition(
        context,
        {
          id: input.id,
          expectedVersion: input.expectedVersion,
          allowedFrom: ["PENDING_REVIEW"],
          to: input.decision,
          action:
            input.decision === "APPROVED"
              ? ENTERPRISE_AUDIT_ACTIONS.changeApproved
              : ENTERPRISE_AUDIT_ACTIONS.changeRejected,
          approvedByUserId:
            input.decision === "APPROVED"
              ? context.principal.userId
              : undefined,
        },
        transaction
      );
    }
  );
}

export async function scheduleChangeRequest(
  context: WorkflowRequestContext,
  input: { id: string; expectedVersion: number; scheduledFor: string }
): Promise<ChangeRequestRecord> {
  requireEnterprisePermission(context.principal, "changes.activate", {
    organizationId: context.principal.organizationId,
  });
  if (new Date(input.scheduledFor).getTime() <= Date.now()) {
    throw new ChangeWorkflowError(
      "Scheduled time must be in the future",
      "INVALID_TRANSITION"
    );
  }
  return withOrganizationTransaction(
    {
      organizationId: context.principal.organizationId,
      userId: context.principal.userId,
    },
    (transaction) =>
      transition(
        context,
        {
          ...input,
          allowedFrom: ["APPROVED"],
          to: "SCHEDULED",
          action: ENTERPRISE_AUDIT_ACTIONS.changeScheduled,
        },
        transaction
      )
  );
}

export async function markChangeDeploying(
  context: WorkflowRequestContext,
  id: string,
  expectedVersion: number
): Promise<ChangeRequestRecord> {
  requireEnterprisePermission(context.principal, "changes.activate", {
    organizationId: context.principal.organizationId,
  });
  return withOrganizationTransaction(
    {
      organizationId: context.principal.organizationId,
      userId: context.principal.userId,
    },
    (transaction) =>
      transition(
        context,
        {
          id,
          expectedVersion,
          allowedFrom: ["APPROVED", "SCHEDULED"],
          to: "DEPLOYING",
          action: ENTERPRISE_AUDIT_ACTIONS.changeDeploying,
        },
        transaction
      )
  );
}

export async function activateChangeRequest(
  context: WorkflowRequestContext,
  input: {
    id: string;
    expectedVersion: number;
    expectedResourceVersion: number;
  }
): Promise<ChangeRequestRecord> {
  requireEnterprisePermission(context.principal, "changes.activate", {
    organizationId: context.principal.organizationId,
  });
  return withOrganizationTransaction(
    {
      organizationId: context.principal.organizationId,
      userId: context.principal.userId,
    },
    async (transaction) => {
      const current = await requireRequest(
        context.principal.organizationId,
        input.id,
        transaction
      );
      const config = await findConfigVersion(
        context.principal.organizationId,
        current.targetConfigVersionId,
        transaction
      );
      if (!config) {
        throw new ChangeWorkflowError("Config version was not found", "NOT_FOUND");
      }
      await activateResourceVersion(
        {
          organizationId: context.principal.organizationId,
          resourceId: current.resourceId,
          configVersion: config.versionNumber,
          expectedResourceVersion: input.expectedResourceVersion,
        },
        transaction
      );
      return transition(
        context,
        {
          id: input.id,
          expectedVersion: input.expectedVersion,
          allowedFrom: ["DEPLOYING"],
          to: "ACTIVE",
          activatedAt: new Date().toISOString(),
          action: ENTERPRISE_AUDIT_ACTIONS.changeActivated,
        },
        transaction
      );
    }
  );
}

export async function rollbackChangeRequest(
  context: WorkflowRequestContext,
  input: {
    id: string;
    expectedVersion: number;
    rollbackConfigVersionId: string;
    expectedResourceVersion: number;
  }
): Promise<ChangeRequestRecord> {
  requireEnterprisePermission(context.principal, "changes.rollback", {
    organizationId: context.principal.organizationId,
  });
  return withOrganizationTransaction(
    {
      organizationId: context.principal.organizationId,
      userId: context.principal.userId,
    },
    async (transaction) => {
      const current = await requireRequest(
        context.principal.organizationId,
        input.id,
        transaction
      );
      const rollbackConfig = await findConfigVersion(
        context.principal.organizationId,
        input.rollbackConfigVersionId,
        transaction
      );
      if (
        !rollbackConfig ||
        rollbackConfig.resourceId !== current.resourceId
      ) {
        throw new ChangeWorkflowError(
          "Rollback config version was not found",
          "NOT_FOUND"
        );
      }
      await activateResourceVersion(
        {
          organizationId: context.principal.organizationId,
          resourceId: current.resourceId,
          configVersion: rollbackConfig.versionNumber,
          expectedResourceVersion: input.expectedResourceVersion,
        },
        transaction
      );
      return transition(
        context,
        {
          id: input.id,
          expectedVersion: input.expectedVersion,
          allowedFrom: ["ACTIVE"],
          to: "ROLLED_BACK",
          action: ENTERPRISE_AUDIT_ACTIONS.changeRolledBack,
        },
        transaction
      );
    }
  );
}

export function canApproveChange(
  principal: EnterprisePrincipal,
  request: ChangeRequestRecord
): boolean {
  return (
    principal.userId !== request.requestedByUserId &&
    authorizeEnterprise(principal, "changes.approve", {
      organizationId: request.organizationId,
    })
  );
}
