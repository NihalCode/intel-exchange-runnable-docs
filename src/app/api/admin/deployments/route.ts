import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  createProductDeployment,
  listDomainAutomationRecords,
  listProductDeployments,
  maskProjectId,
} from "@/lib/deployment/repository";
import { getVercelProvider } from "@/lib/deployment/providers";
import { approvedCollectionIdForProduct } from "@/lib/deployment/postman-collection-registry";
import { guardEnterpriseApi } from "@/lib/enterprise/guard";
import { requireMutationCsrf } from "@/lib/enterprise/http";
import { isProductKey } from "@/lib/products/registry";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const access = await guardEnterpriseApi(request, "deployments.read");
  if (access instanceof NextResponse) return access;

  const deployments = await listProductDeployments(access.context.organization.id);
  const provider = getVercelProvider();
  const enriched = await Promise.all(
    deployments.map(async (d) => {
      const domains = await listDomainAutomationRecords(
        access.context.organization.id,
        d.id
      );
      let latestDeployment = null;
      try {
        const list = await provider.listDeployments(d.vercelProjectId);
        latestDeployment = list[0] ?? null;
      } catch {
        latestDeployment = null;
      }
      return {
        ...d,
        vercelProjectIdMasked: maskProjectId(d.vercelProjectId),
        domains,
        latestDeployment,
        approvedCollectionId: approvedCollectionIdForProduct(d.product),
      };
    })
  );

  return NextResponse.json({ deployments: enriched });
}

export async function POST(request: NextRequest) {
  const csrfFailure = requireMutationCsrf(request);
  if (csrfFailure) return csrfFailure;
  const access = await guardEnterpriseApi(request, "deployments.manage");
  if (access instanceof NextResponse) return access;

  const body = (await request.json()) as Record<string, unknown>;
  const product = String(body.product ?? "");
  if (!isProductKey(product)) {
    return NextResponse.json({ error: "Invalid product" }, { status: 400 });
  }

  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  if (!teamId) {
    return NextResponse.json({ error: "VERCEL_TEAM_ID not configured" }, { status: 503 });
  }

  try {
    const deployment = await createProductDeployment({
      organizationId: access.context.organization.id,
      userId: access.session.user.id,
      config: {
        product,
        postmanCollectionId: approvedCollectionIdForProduct(product),
        vercelTeamId: teamId,
        vercelProjectId: String(body.vercelProjectId ?? ""),
        vercelProjectName: String(body.vercelProjectName ?? ""),
        environment: (body.environment as "production") ?? "production",
        primaryDomain: body.primaryDomain ? String(body.primaryDomain) : null,
        enabled: true,
        status: "configuring",
      },
    });
    return NextResponse.json({ deployment }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Create failed" },
      { status: 400 }
    );
  }
}
