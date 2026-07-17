import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getProductDeployment, recordDeploymentAuditEvent } from "@/lib/deployment/repository";
import { getVercelProvider } from "@/lib/deployment/providers";
import { guardEnterpriseApi } from "@/lib/enterprise/guard";
import { correlationIds } from "@/lib/enterprise/observability";
import { requireMutationCsrf } from "@/lib/enterprise/http";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ deploymentId: string }> }
) {
  const csrfFailure = requireMutationCsrf(request);
  if (csrfFailure) return csrfFailure;

  const access = await guardEnterpriseApi(request, "deployments.manage");
  if (access instanceof NextResponse) return access;

  const { deploymentId } = await context.params;
  const body = (await request.json()) as {
    action?: "promote" | "rollback";
    vercelDeploymentId?: string;
  };
  const action = body.action ?? "promote";

  const deployment = await getProductDeployment(
    access.context.organization.id,
    deploymentId
  );
  if (!deployment) {
    return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
  }

  const provider = getVercelProvider(deployment.vercelTeamId);
  const requestId = correlationIds(request.headers).requestId;

  try {
    let result;
    if (action === "rollback") {
      result = await provider.rollbackDeployment(deployment.vercelProjectId);
    } else {
      const targetId = body.vercelDeploymentId?.trim();
      if (!targetId) {
        return NextResponse.json(
          { error: "vercelDeploymentId required for promote" },
          { status: 400 }
        );
      }
      result = await provider.promoteDeployment(targetId);
    }

    await recordDeploymentAuditEvent({
      organizationId: access.context.organization.id,
      deploymentId,
      eventType: action === "rollback" ? "deployment_rollback" : "deployment_promote",
      actorUserId: access.session.user.id,
      requestId,
      payload: { vercelDeploymentId: result.id, url: result.url, state: result.state },
    });

    return NextResponse.json({ ok: true, deployment: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Deployment action failed" },
      { status: 400 }
    );
  }
}
