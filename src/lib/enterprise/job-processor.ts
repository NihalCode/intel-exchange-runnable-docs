import "server-only";

import { randomUUID } from "node:crypto";

import {
  withOrganizationTransaction,
} from "@/lib/db/client";
import {
  activateChangeRequest,
  markChangeDeploying,
} from "@/lib/enterprise/change-workflow";
import type { WorkflowRequestContext } from "@/lib/enterprise/change-workflow";
import {
  findControlPlaneResource,
  listOrganizations,
} from "@/lib/enterprise/repository";
import type { ChangeRequestRecord, EnterprisePrincipal } from "@/lib/enterprise/types";
import {
  claimDueJobs,
  completeJob,
  failJob,
  listDueScheduledChanges,
} from "@/lib/enterprise/repository";

const SYSTEM_CRON_USER = "control-plane-cron";

export interface ProcessJobsResult {
  organizationsProcessed: number;
  scheduledChangesActivated: number;
  jobsCompleted: number;
  jobsFailed: number;
  errors: string[];
}

function cronPrincipal(
  organizationId: string,
  actorUserId: string
): EnterprisePrincipal {
  return {
    userId: actorUserId,
    organizationId,
    role: "owner",
    status: "active",
  };
}

function cronWorkflowContext(
  organizationId: string,
  actorUserId: string
): WorkflowRequestContext {
  return {
    principal: cronPrincipal(organizationId, actorUserId),
    correlationId: `cron-${randomUUID()}`,
    requestId: `cron-${randomUUID()}`,
  };
}

function cronActorForChange(change: ChangeRequestRecord): string {
  return change.approvedByUserId ?? change.requestedByUserId;
}

async function activateScheduledChange(
  change: ChangeRequestRecord
): Promise<void> {
  const actorUserId = cronActorForChange(change);
  const context = cronWorkflowContext(change.organizationId, actorUserId);
  const resource = await findControlPlaneResource(
    change.organizationId,
    change.resourceId
  );
  if (!resource) {
    throw new Error(`Resource ${change.resourceId} was not found`);
  }
  const deploying = await markChangeDeploying(
    context,
    change.id,
    change.version
  );
  await activateChangeRequest(context, {
    id: change.id,
    expectedVersion: deploying.version,
    expectedResourceVersion: resource.version,
  });
}

async function processOrganizationJobs(
  organizationId: string,
  limit: number
): Promise<{
  scheduledChangesActivated: number;
  jobsCompleted: number;
  jobsFailed: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let scheduledChangesActivated = 0;
  let jobsCompleted = 0;
  let jobsFailed = 0;

  const dueChanges = await withOrganizationTransaction(
    { organizationId, userId: SYSTEM_CRON_USER },
    (transaction) =>
      listDueScheduledChanges(organizationId, new Date().toISOString(), limit, transaction)
  );
  for (const change of dueChanges) {
    try {
      await activateScheduledChange(change);
      scheduledChangesActivated += 1;
    } catch (error) {
      errors.push(
        `change ${change.id}: ${error instanceof Error ? error.message : "activation failed"}`
      );
    }
  }

  const claimed = await withOrganizationTransaction(
    { organizationId, userId: SYSTEM_CRON_USER },
    (transaction) =>
      claimDueJobs(
        {
          organizationId,
          lockedBy: SYSTEM_CRON_USER,
          limit,
        },
        transaction
      )
  );

  for (const job of claimed) {
    try {
      if (job.jobType === "noop") {
        await withOrganizationTransaction(
          { organizationId, userId: SYSTEM_CRON_USER },
          (transaction) =>
            completeJob(
              {
                organizationId,
                id: job.id,
                expectedVersion: job.version,
                result: { ok: true },
              },
              transaction
            )
        );
        jobsCompleted += 1;
        continue;
      }
      await withOrganizationTransaction(
        { organizationId, userId: SYSTEM_CRON_USER },
        (transaction) =>
          completeJob(
            {
              organizationId,
              id: job.id,
              expectedVersion: job.version,
              result: { skipped: true, reason: "unsupported job type" },
            },
            transaction
          )
      );
      jobsCompleted += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "job failed";
      try {
        await withOrganizationTransaction(
          { organizationId, userId: SYSTEM_CRON_USER },
          (transaction) =>
            failJob(
              {
                organizationId,
                id: job.id,
                expectedVersion: job.version,
                error: message,
              },
              transaction
            )
        );
      } catch {
        errors.push(`job ${job.id}: ${message} (failure record failed)`);
        continue;
      }
      jobsFailed += 1;
      errors.push(`job ${job.id}: ${message}`);
    }
  }

  return {
    scheduledChangesActivated,
    jobsCompleted,
    jobsFailed,
    errors,
  };
}

export async function processControlPlaneJobs(input: {
  organizationId?: string;
  limit?: number;
}): Promise<ProcessJobsResult> {
  const limit = Math.min(Math.max(Math.floor(input.limit ?? 25), 1), 100);
  const organizations = input.organizationId
    ? [{ id: input.organizationId }]
    : await listOrganizations();

  let scheduledChangesActivated = 0;
  let jobsCompleted = 0;
  let jobsFailed = 0;
  const errors: string[] = [];

  for (const organization of organizations) {
    const result = await processOrganizationJobs(organization.id, limit);
    scheduledChangesActivated += result.scheduledChangesActivated;
    jobsCompleted += result.jobsCompleted;
    jobsFailed += result.jobsFailed;
    errors.push(...result.errors);
  }

  return {
    organizationsProcessed: organizations.length,
    scheduledChangesActivated,
    jobsCompleted,
    jobsFailed,
    errors,
  };
}
