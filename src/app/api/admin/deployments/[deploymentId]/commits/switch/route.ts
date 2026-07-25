import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  assertApprovedCommitSwitch,
  CommitSwitchApprovalError,
  finalizeCommitSwitchChangeRequest,
  proposeCommitSwitch,
} from "@/lib/deployment/commit-change-requests";
import {
  getProductDeployment,
  recordDeploymentAuditEvent,
} from "@/lib/deployment/repository";
import { getVercelProvider } from "@/lib/deployment/providers";
import { isDocumentationFeatureEnabled } from "@/lib/documentation-features";
import { guardEnterpriseApi, type EnterpriseAccess } from "@/lib/enterprise/guard";
import {
  controlPlaneJson,
  errorResponse,
  requireEnterpriseMutationRateLimit,
  requireMutationCsrf,
  workflowContext,
} from "@/lib/enterprise/http";
import { correlationIds } from "@/lib/enterprise/observability";

export const runtime = "nodejs";

async function requireFeature(access: EnterpriseAccess): Promise<NextResponse | null> {
  const enabled = await isDocumentationFeatureEnabled({
    organizationId: access.context.organization.id,
    key: "admin_deployment_management",
    role: access.context.principal.role,
  });
  if (!enabled) {
    return controlPlaneJson(
      { error: "Feature unavailable", code: "FEATURE_DISABLED" },
      { status: 403 }
    );
  }
  return null;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ deploymentId: string }> }
) {
  const csrfFailure = requireMutationCsrf(request);
  if (csrfFailure) return csrfFailure;

  try {
    const { deploymentId } = await context.params;
    const body = (await request.json()) as {
      vercelDeploymentId?: string;
      commitSha?: string | null;
      fromCommitSha?: string | null;
      url?: string | null;
      changeRequestId?: string;
      proposeOnly?: boolean;
      mode?: "propose" | "direct" | "execute";
    };

    const vercelDeploymentId = body.vercelDeploymentId?.trim();
    if (!vercelDeploymentId) {
      return controlPlaneJson(
        { error: "vercelDeploymentId is required" },
        { status: 400 }
      );
    }

    const changeRequestId = body.changeRequestId?.trim() || "";
    const mode =
      body.mode ??
      (changeRequestId ? "execute" : body.proposeOnly === false ? "direct" : "propose");

    // Propose: developers may request without deployments.manage / production write gate.
    if (mode === "propose") {
      const access = await guardEnterpriseApi(request, "changes.create");
      if (access instanceof NextResponse) return access;
      const featureBlocked = await requireFeature(access);
      if (featureBlocked) return featureBlocked;
      const submitAccess = await guardEnterpriseApi(request, "changes.submit");
      if (submitAccess instanceof NextResponse) return submitAccess;
      const rateLimited = requireEnterpriseMutationRateLimit(access);
      if (rateLimited) return rateLimited;

      const deployment = await getProductDeployment(
        access.context.organization.id,
        deploymentId
      );
      if (!deployment) {
        return controlPlaneJson({ error: "Deployment not found" }, { status: 404 });
      }

      const idempotencyKey =
        request.headers.get("idempotency-key")?.trim() ||
        `commit-switch-${deploymentId}-${vercelDeploymentId}-${Date.now()}`;

      const proposed = await proposeCommitSwitch(workflowContext(access, request), {
        deploymentId,
        vercelDeploymentId,
        commitSha: body.commitSha,
        fromCommitSha: body.fromCommitSha,
        url: body.url,
        idempotencyKey,
      });

      await recordDeploymentAuditEvent({
        organizationId: access.context.organization.id,
        deploymentId,
        eventType: "commit_switch_proposed",
        actorUserId: access.session.user.id,
        requestId: correlationIds(request.headers).requestId,
        payload: {
          changeRequestId: proposed.changeRequest.id,
          vercelDeploymentId,
          commitSha: body.commitSha ?? null,
          fromCommitSha: body.fromCommitSha ?? null,
        },
      });

      return controlPlaneJson(
        {
          requiresApproval: true,
          changeRequest: proposed.changeRequest,
          commitChangeRequestId: proposed.commitChangeRequestId,
          message:
            "Commit switch submitted for approval. Approve in Admin → APIs, then Execute approved switch on Commits.",
        },
        { status: 202 }
      );
    }

    // Execute approved or direct non-prod promote.
    let access = await guardEnterpriseApi(request, "deployments.manage");
    if (access instanceof NextResponse) return access;
    const featureBlocked = await requireFeature(access);
    if (featureBlocked) return featureBlocked;

    const deployment = await getProductDeployment(
      access.context.organization.id,
      deploymentId
    );
    if (!deployment) {
      return controlPlaneJson({ error: "Deployment not found" }, { status: 404 });
    }

    if (deployment.environment === "production") {
      access = await guardEnterpriseApi(request, "deployments.manage", {
        resource: {
          organizationId: access.context.organization.id,
          environment: "production",
        },
      });
      if (access instanceof NextResponse) {
        return controlPlaneJson(
          {
            error: "You do not have permission to switch production commits.",
            code: "FORBIDDEN",
          },
          { status: 403 }
        );
      }
    }

    const rateLimited = requireEnterpriseMutationRateLimit(access);
    if (rateLimited) return rateLimited;

    const requestId = correlationIds(request.headers).requestId;
    const provider = getVercelProvider(deployment.vercelTeamId);

    if (mode === "direct") {
      if (deployment.environment === "production") {
        return controlPlaneJson(
          {
            error:
              "Production commit switches require propose → approve → execute. Use proposeOnly.",
            code: "APPROVAL_REQUIRED",
          },
          { status: 403 }
        );
      }

      const listed = await provider.listDeployments(deployment.vercelProjectId);
      const target = listed.find((d) => d.id === vercelDeploymentId);
      if (!target || target.state.toUpperCase() !== "READY") {
        return controlPlaneJson(
          { error: "Target deployment is not READY", code: "NOT_READY" },
          { status: 400 }
        );
      }

      const result = await provider.promoteDeployment(vercelDeploymentId);
      await recordDeploymentAuditEvent({
        organizationId: access.context.organization.id,
        deploymentId,
        eventType: "commit_switch_executed",
        actorUserId: access.session.user.id,
        requestId,
        payload: {
          mode: "direct",
          vercelDeploymentId: result.id,
          commitSha: body.commitSha ?? target.meta?.githubCommitSha ?? null,
          fromCommitSha: body.fromCommitSha ?? null,
          url: result.url,
          state: result.state,
        },
      });
      return controlPlaneJson({ ok: true, deployment: result, mode: "direct" });
    }

    // execute
    if (!changeRequestId) {
      return controlPlaneJson(
        { error: "changeRequestId required to execute approved switch" },
        { status: 400 }
      );
    }

    const approved = await assertApprovedCommitSwitch({
      organizationId: access.context.organization.id,
      principal: access.context.principal,
      changeRequestId,
      deploymentId,
      vercelDeploymentId,
      commitSha: body.commitSha,
    });

    if (approved.state === "ACTIVE") {
      return controlPlaneJson({
        ok: true,
        alreadyExecuted: true,
        changeRequestId: approved.id,
      });
    }

    let result;
    try {
      result = await provider.promoteDeployment(vercelDeploymentId);
    } catch (error) {
      await recordDeploymentAuditEvent({
        organizationId: access.context.organization.id,
        deploymentId,
        eventType: "commit_switch_failed",
        actorUserId: access.session.user.id,
        requestId,
        payload: {
          changeRequestId,
          vercelDeploymentId,
          commitSha: body.commitSha ?? null,
          error: error instanceof Error ? error.message : "promote failed",
        },
      });
      throw error;
    }

    await finalizeCommitSwitchChangeRequest(
      workflowContext(access, request),
      approved,
      deployment
    );

    await recordDeploymentAuditEvent({
      organizationId: access.context.organization.id,
      deploymentId,
      eventType: "commit_switch_executed",
      actorUserId: access.session.user.id,
      requestId,
      payload: {
        mode: "execute",
        changeRequestId: approved.id,
        vercelDeploymentId: result.id,
        commitSha: body.commitSha ?? result.meta?.githubCommitSha ?? null,
        fromCommitSha: body.fromCommitSha ?? null,
        url: result.url,
        state: result.state,
      },
    });

    return controlPlaneJson({
      ok: true,
      deployment: result,
      changeRequestId: approved.id,
      mode: "execute",
    });
  } catch (error) {
    if (error instanceof CommitSwitchApprovalError) {
      const status =
        error.code === "NOT_FOUND"
          ? 404
          : error.code === "NOT_APPROVED" ||
              error.code === "PAYLOAD_MISMATCH" ||
              error.code === "NOT_READY" ||
              error.code === "ALREADY_CURRENT"
            ? 409
            : 403;
      return controlPlaneJson({ error: error.message, code: error.code }, { status });
    }
    return errorResponse(error);
  }
}
