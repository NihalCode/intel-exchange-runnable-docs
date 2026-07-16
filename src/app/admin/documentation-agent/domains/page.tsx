import { DocumentationAgentDomainsPage } from "@/components/admin/pages/DocumentationAgentDomainsPage";
import {
  requireAdminFeature,
  requireAdminPageContext,
  requirePermission,
} from "@/lib/admin/page-data";
import { listDomainMappings } from "@/lib/domains/repository";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { capabilities, context } = await requireAdminPageContext();
  requirePermission(capabilities, "domains.read");
  await requireAdminFeature(context.organization.id, "host_based_product_routing");
  const mappings = await listDomainMappings(context.organization.id);
  return <DocumentationAgentDomainsPage mappings={mappings} />;
}
