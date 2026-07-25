import { DocumentationAgentCommitsPage } from "@/components/admin/pages/DocumentationAgentCommitsPage";
import { listCommitHistories } from "@/lib/deployment/commit-history";
import type { DeploymentEnvironment } from "@/lib/deployment/types";
import {
  requireAdminFeature,
  requireAdminPageContext,
  requirePermission,
} from "@/lib/admin/page-data";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{ env?: string }>;
}) {
  const { capabilities, context } = await requireAdminPageContext();
  requirePermission(capabilities, "deployments.read");
  await requireAdminFeature(context.organization.id, "admin_deployment_management");

  const params = (await searchParams) ?? {};
  const envRaw = params.env?.trim();
  const environment =
    envRaw === "production" ||
    envRaw === "staging" ||
    envRaw === "development" ||
    envRaw === "preview"
      ? (envRaw as DeploymentEnvironment)
      : null;

  const products = await listCommitHistories({
    organizationId: context.organization.id,
    environment,
  });

  return (
    <DocumentationAgentCommitsPage
      initialProducts={products}
      canPropose={capabilities.includes("changes.create")}
      canExecute={capabilities.includes("deployments.manage")}
    />
  );
}
