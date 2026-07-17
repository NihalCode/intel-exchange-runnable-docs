import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  addDomainToDeployment,
  checkDeploymentDomainDns,
  removeDeploymentDomain,
  verifyDeploymentDomain,
} from "@/lib/deployment/domain-workflow";
import { guardEnterpriseApi } from "@/lib/enterprise/guard";
import { requireMutationCsrf } from "@/lib/enterprise/http";
import { correlationIds } from "@/lib/enterprise/observability";

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
  const body = (await request.json()) as { domain?: string; action?: string };
  const domain = body.domain?.trim();
  if (!domain) return NextResponse.json({ error: "domain required" }, { status: 400 });

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
    if (body.action === "verify") {
      return NextResponse.json(await verifyDeploymentDomain(base));
    }
    if (body.action === "remove") {
      await removeDeploymentDomain(base);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json(await addDomainToDeployment(base));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Operation failed" },
      { status: 400 }
    );
  }
}
