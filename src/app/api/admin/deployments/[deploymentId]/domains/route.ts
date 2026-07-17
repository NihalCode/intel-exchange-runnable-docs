import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  addDomainToDeployment,
  checkDeploymentDomainDns,
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
import { guardEnterpriseApi } from "@/lib/enterprise/guard";
import { correlationIds } from "@/lib/enterprise/observability";
import { requireMutationCsrf, workflowContext } from "@/lib/enterprise/http";

export const runtime = "nodejs";

function resolveAction(raw?: string): DomainMutationAction | undefined {
  if (raw === "check-dns") return undefined;
  if (raw === "verify") return "verify";
  if (raw === "remove") return "remove";
  return "add";
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ deploymentId: string }> }
) {
  const csrfFailure = requireMutationCsrf(request);
  if (csrfFailure) return csrfFailure;

  const { deploymentId } = await context.params;
  const body = (await request.json()) as {
    domain?: string;
    action?: string;
    changeRequestId?: string;
    proposeOnly?: boolean;
  };
  const domain = body.domain?.trim();
  if (!domain) return NextResponse.json({ error: "domain required" }, { status: 400 });

  const initialAccess = await guardEnterpriseApi(request, "deployments.manage");
  if (initialAccess instanceof NextResponse) return initialAccess;

  const deployment = await getProductDeployment(
    initialAccess.context.organization.id,
    deploymentId
  );
  if (!deployment) {
    return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
  }

  const mutationAction = resolveAction(body.action);
  const requiresApproval = isProductionDomainMutation(deployment, mutationAction ?? body.action);

  let access = initialAccess;
  if (requiresApproval) {
    const productionAccess = await guardEnterpriseApi(request, "deployments.manage", {
      resource: {
        organizationId: initialAccess.context.organization.id,
        environment: "production",
      },
      requireMfa: true,
      maxAuthAgeSeconds: 10 * 60,
    });
    if (productionAccess instanceof NextResponse) {
      return NextResponse.json(
        { error: "Step-up MFA and recent authentication required for production domain changes" },
        { status: 403 }
      );
    }
    access = productionAccess;
  }

  const requestId = correlationIds(request.headers).requestId;
  const base = {
    organizationId: access.context.organization.id,
    userId: access.session.user.id,
    deploymentId,
    domain,
    requestId,
  };

  try {
    if (body.action === "check-dns") {
      return NextResponse.json(await checkDeploymentDomainDns(base));
    }

    if (requiresApproval && mutationAction) {
      if (body.proposeOnly || !body.changeRequestId) {
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
        return NextResponse.json(
          {
            requiresApproval: true,
            changeRequest: proposed.changeRequest,
            domainChangeRequestId: proposed.domainChangeRequestId,
            message:
              "Production domain mutation submitted for change-request approval. Approve the change, then retry with changeRequestId.",
          },
          { status: 202 }
        );
      }

      const approved = await assertApprovedProductionDomainMutation({
        organizationId: access.context.organization.id,
        principal: access.context.principal,
        changeRequestId: body.changeRequestId,
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
      return NextResponse.json({ ok: true, result, changeRequestId: approved.id });
    }

    if (body.action === "verify") {
      return NextResponse.json(await verifyDeploymentDomain(base));
    }
    if (body.action === "remove") {
      await removeDeploymentDomain(base);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json(await addDomainToDeployment(base));
  } catch (err) {
    if (err instanceof DomainMutationApprovalError) {
      const status =
        err.code === "NOT_FOUND"
          ? 404
          : err.code === "NOT_APPROVED" || err.code === "PAYLOAD_MISMATCH"
            ? 409
            : 403;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Operation failed" },
      { status: 400 }
    );
  }
}
