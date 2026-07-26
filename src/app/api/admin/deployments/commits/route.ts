import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { listCommitHistories } from "@/lib/deployment/commit-history";
import type { DeploymentEnvironment } from "@/lib/deployment/types";
import { guardEnterpriseApi } from "@/lib/enterprise/guard";
import { resolveDocumentationFeatureEnabled } from "@/lib/documentation-features/resolve-enabled";

export const runtime = "nodejs";

const ENVIRONMENTS = new Set<DeploymentEnvironment>([
  "development",
  "preview",
  "staging",
  "production",
]);

export async function GET(request: NextRequest) {
  const access = await guardEnterpriseApi(request, "deployments.read");
  if (access instanceof NextResponse) return access;

  // Match admin page gate (requireAdminFeature → resolveDocumentationFeatureEnabled)
  // so product hosts with APP_PRODUCT_ID get the same multi-project override.
  const enabled = await resolveDocumentationFeatureEnabled({
    organizationId: access.context.organization.id,
    key: "admin_deployment_management",
    role: access.context.principal.role,
  });
  if (!enabled) {
    return NextResponse.json(
      { error: "Feature unavailable", code: "FEATURE_DISABLED" },
      { status: 403 }
    );
  }

  const envParam = request.nextUrl.searchParams.get("environment")?.trim();
  const environment =
    envParam && ENVIRONMENTS.has(envParam as DeploymentEnvironment)
      ? (envParam as DeploymentEnvironment)
      : null;

  const products = await listCommitHistories({
    organizationId: access.context.organization.id,
    environment,
  });

  return NextResponse.json({
    products,
    listLimitNote:
      "At most 25 Vercel deployments per product are listed (deployable history, not full GitHub history).",
  });
}
