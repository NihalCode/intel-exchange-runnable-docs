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
  claimDueJobs,
  completeJob,
  failJob,
  findControlPlaneResource,
  getConfigVersionDetail,
  listDueScheduledChanges,
  listOrganizations,
} from "@/lib/enterprise/repository";
import { isPromoteCommitConfig } from "@/lib/deployment/commit-change-requests";
import type { ChangeRequestRecord, EnterprisePrincipal } from "@/lib/enterprise/types";
import { processAnalyticsOutbox } from "@/lib/query-analytics/service";
import { buildUnansweredWeeklySnapshots } from "@/lib/query-analytics/unanswered-intel";
import { resolveUnansweredWeeklyAnalyticsEnabled } from "@/lib/domains/feature-gates-resolve";

const SYSTEM_CRON_USER = "control-plane-cron";

export interface ProcessJobsResult {
  organizationsProcessed: number;
  scheduledChangesActivated: number;
  jobsCompleted: number;
  jobsFailed: number;
  analyticsOutboxProcessed: number;
  weeklySnapshotsUpserted: number;
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
      const configVersion = await getConfigVersionDetail(
        change.organizationId,
        change.targetConfigVersionId
      );
      if (isPromoteCommitConfig(configVersion?.config ?? null)) {
        errors.push(
          `change ${change.id}: promote_commit cannot be activated by Sync Jobs; execute via Commits tab`
        );
        continue;
      }
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
  let analyticsOutboxProcessed = 0;
  let weeklySnapshotsUpserted = 0;
  const errors: string[] = [];

  for (const organization of organizations) {
    const result = await processOrganizationJobs(organization.id, limit);
    scheduledChangesActivated += result.scheduledChangesActivated;
    jobsCompleted += result.jobsCompleted;
    jobsFailed += result.jobsFailed;
    errors.push(...result.errors);

    try {
      const weeklyEnabled = await resolveUnansweredWeeklyAnalyticsEnabled({
        organizationId: organization.id,
        role: "owner",
      });
      if (weeklyEnabled) {
        const weekly = await buildUnansweredWeeklySnapshots({
          organizationId: organization.id,
        });
        weeklySnapshotsUpserted += weekly.rowsUpserted;
      }
    } catch (error) {
      errors.push(
        `weekly_unanswered ${organization.id}: ${
          error instanceof Error ? error.message : "snapshot failed"
        }`
      );
    }
  }

  try {
    const outbox = await processAnalyticsOutbox(limit);
    analyticsOutboxProcessed = outbox.processed;
    if (outbox.failed > 0 || outbox.deadLetter > 0) {
      errors.push(
        `analytics_outbox: failed=${outbox.failed} dead_letter=${outbox.deadLetter}`
      );
    }
  } catch (error) {
    errors.push(
      `analytics_outbox: ${error instanceof Error ? error.message : "process failed"}`
    );
  }

  return {
    organizationsProcessed: organizations.length,
    scheduledChangesActivated,
    jobsCompleted,
    jobsFailed,
    analyticsOutboxProcessed,
    weeklySnapshotsUpserted,
    errors,
  };
}
