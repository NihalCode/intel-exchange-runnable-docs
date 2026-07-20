import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  addDomainToDeployment,
  checkDeploymentDomainDns,
  importExistingDomainOnDeployment,
  removeDeploymentDomain,
  verifyDeploymentDomain,
} from "@/lib/deployment/domain-workflow";
import {
  assertApprovedProductionDomainMutation,
  DomainMutationApprovalError,
  finalizeDomainMutationChangeRequest,
  isProductionDomainMutation,
  proposeProductionDomainMutation,
  type DomainMutationAction,
} from "@/lib/deployment/domain-change-requests";
import { getProductDeployment } from "@/lib/deployment/repository";
import { guardEnterpriseApi, type EnterpriseAccess } from "@/lib/enterprise/guard";
import {
  controlPlaneJson,
  errorResponse,
  requireMutationCsrf,
  workflowContext,
} from "@/lib/enterprise/http";
import { correlationIds } from "@/lib/enterprise/observability";

export const runtime = "nodejs";

function resolveAction(raw?: string): DomainMutationAction | undefined {
  if (raw === "check-dns") return undefined;
  if (raw === "verify") return "verify";
  if (raw === "remove") return "remove";
  return "add";
}

async function guardProductionDomainMutation(
  request: NextRequest,
  access: EnterpriseAccess
): Promise<EnterpriseAccess | NextResponse> {
  // Role-scoped production check only — no MFA re-challenge after login.
  const productionAccess = await guardEnterpriseApi(request, "deployments.manage", {
    resource: {
      organizationId: access.context.organization.id,
      environment: "production",
    },
  });
  if (productionAccess instanceof NextResponse) {
    return controlPlaneJson(
      {
        error: "You do not have permission to change production domains.",
        code: "FORBIDDEN",
      },
      { status: 403 }
    );
  }
  return productionAccess;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ deploymentId: string }> }
) {
  const csrfFailure = requireMutationCsrf(request);
  if (csrfFailure) return csrfFailure;

  let access: EnterpriseAccess | null = null;
  try {
    const { deploymentId } = await context.params;

    const initialAccess = await guardEnterpriseApi(request, "deployments.manage");
    if (initialAccess instanceof NextResponse) return initialAccess;
    access = initialAccess;

    const body = (await request.json()) as {
      domain?: string;
      action?: string;
      changeRequestId?: string;
      proposeOnly?: boolean;
    };
    const domain = body.domain?.trim();
    if (!domain) {
      return controlPlaneJson({ error: "domain required" }, { status: 400 });
    }

    const deployment = await getProductDeployment(
      access.context.organization.id,
      deploymentId
    );
    if (!deployment) {
      return controlPlaneJson({ error: "Deployment not found" }, { status: 404 });
    }

    const actionRaw = typeof body.action === "string" ? body.action : undefined;
    const mutationAction = resolveAction(actionRaw);
    const changeRequestId =
      typeof body.changeRequestId === "string" ? body.changeRequestId.trim() : "";

    const requestId = correlationIds(request.headers).requestId;
    const base = {
      organizationId: access.context.organization.id,
      userId: access.session.user.id,
      deploymentId,
      domain,
      requestId,
    };

    if (actionRaw === "check-dns") {
      return controlPlaneJson(await checkDeploymentDomainDns(base));
    }

    // Read-only import from an already-attached Vercel domain — no MFA / change request.
    if (mutationAction === "add" && !changeRequestId) {
      const imported = await importExistingDomainOnDeployment(base);
      if (imported) {
        return controlPlaneJson({
          ok: true,
          imported: true,
          message: "Domain is already on this Vercel project — imported into the control plane.",
          result: imported,
        });
      }
    }

    const requiresApproval = isProductionDomainMutation(
      deployment,
      mutationAction ?? actionRaw
    );

    if (requiresApproval) {
      const productionAccess = await guardProductionDomainMutation(request, access);
      if (productionAccess instanceof NextResponse) return productionAccess;
      access = productionAccess;
    }

    if (requiresApproval && mutationAction) {
      const proposeOnly = body.proposeOnly === true;
      if (proposeOnly || !changeRequestId) {
        const idempotencyKey =
          request.headers.get("idempotency-key")?.trim() ||
          `domain-${deploymentId}-${mutationAction}-${domain}-${Date.now()}`;
        const proposed = await proposeProductionDomainMutation(
          workflowContext(access, request),
          {
            deploymentId,
            domain,
            action: mutationAction,
            idempotencyKey,
          }
        );
        return controlPlaneJson(
          {
            requiresApproval: true,
            changeRequest: proposed.changeRequest,
            domainChangeRequestId: proposed.domainChangeRequestId,
            message:
              "Production domain mutation submitted for change-request approval. Approve the change in Admin → Change Requests, then retry with changeRequestId.",
          },
          { status: 202 }
        );
      }

      const approved = await assertApprovedProductionDomainMutation({
        organizationId: access.context.organization.id,
        principal: access.context.principal,
        changeRequestId,
        deploymentId,
        domain,
        action: mutationAction,
      });

      let result: unknown;
      if (mutationAction === "verify") {
        result = await verifyDeploymentDomain(base);
      } else if (mutationAction === "remove") {
        await removeDeploymentDomain(base);
        result = { ok: true };
      } else {
        result = await addDomainToDeployment(base);
      }

      await finalizeDomainMutationChangeRequest(
        workflowContext(access, request),
        approved,
        deployment
      );
      return controlPlaneJson({ ok: true, result, changeRequestId: approved.id });
    }

    if (actionRaw === "verify") {
      return controlPlaneJson(await verifyDeploymentDomain(base));
    }
    if (actionRaw === "remove") {
      await removeDeploymentDomain(base);
      return controlPlaneJson({ ok: true });
    }
    return controlPlaneJson(await addDomainToDeployment(base));
  } catch (error) {
    if (error instanceof DomainMutationApprovalError) {
      const status =
        error.code === "NOT_FOUND"
          ? 404
          : error.code === "NOT_APPROVED" || error.code === "PAYLOAD_MISMATCH"
            ? 409
            : 403;
      return controlPlaneJson({ error: error.message, code: error.code }, { status });
    }
    return errorResponse(error);
  }
}
