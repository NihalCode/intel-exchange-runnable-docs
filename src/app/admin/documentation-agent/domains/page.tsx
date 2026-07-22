import { DocumentationAgentDomainsPage } from "@/components/admin/pages/DocumentationAgentDomainsPage";
import {
  requireAdminPageContext,
  requirePermission,
} from "@/lib/admin/page-data";
import { resolveDocumentationFeatureEnabled } from "@/lib/documentation-features/resolve-enabled";
import { listDomainMappings } from "@/lib/domains/repository";

export const dynamic = "force-dynamic";

/**
 * Domains admin UI is available with `domains.read` even when host-based
 * routing is disabled — operators need to manage mappings before/while enabling
 * the runtime gate. Do not `requireAdminFeature` here (that 404'd the nav item).
 */
export default async function Page() {
  const { capabilities, context } = await requireAdminPageContext();
  requirePermission(capabilities, "domains.read");
  const [mappings, routingEnabled] = await Promise.all([
    listDomainMappings(context.organization.id),
    resolveDocumentationFeatureEnabled({
      organizationId: context.organization.id,
      key: "host_based_product_routing",
    }),
  ]);
  return (
    <DocumentationAgentDomainsPage
      mappings={mappings}
      routingEnabled={routingEnabled}
    />
  );
}
