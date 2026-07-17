import { DocumentationAgentDeploymentsPage } from "@/components/admin/pages/DocumentationAgentDeploymentsPage";
import {
  listDomainAutomationRecords,
  listProductDeployments,
  maskProjectId,
} from "@/lib/deployment/repository";
import { getVercelProvider } from "@/lib/deployment/providers";
import { approvedCollectionIdForProduct } from "@/lib/deployment/postman-collection-registry";
import {
  requireAdminFeature,
  requireAdminPageContext,
  requirePermission,
} from "@/lib/admin/page-data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { capabilities, context } = await requireAdminPageContext();
  requirePermission(capabilities, "deployments.read");
  await requireAdminFeature(context.organization.id, "admin_deployment_management");

  const deployments = await listProductDeployments(context.organization.id);
  const provider = getVercelProvider();

  const enriched = await Promise.all(
    deployments.map(async (d) => {
      const domains = await listDomainAutomationRecords(context.organization.id, d.id);
      let recentDeployments: Array<{
        id: string;
        url: string;
        state: string;
        meta?: { githubCommitSha?: string };
      }> = [];
      let latestDeployment = null;
      try {
        recentDeployments = await provider.listDeployments(d.vercelProjectId);
        latestDeployment = recentDeployments[0] ?? null;
      } catch {
        recentDeployments = [];
        latestDeployment = null;
      }
      return {
        id: d.id,
        product: d.product,
        vercelProjectName: d.vercelProjectName,
        vercelProjectIdMasked: maskProjectId(d.vercelProjectId),
        environment: d.environment,
        status: d.status,
        primaryDomain: d.primaryDomain,
        approvedCollectionId: approvedCollectionIdForProduct(d.product),
        domains,
        latestDeployment,
        recentDeployments,
      };
    })
  );

  return <DocumentationAgentDeploymentsPage initialDeployments={enriched} />;
}
