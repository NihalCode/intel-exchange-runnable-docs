import { notFound } from "next/navigation";

import { DocumentationAgentDashboard } from "@/components/admin/DocumentationAgentDashboard";
import { getAppSession } from "@/lib/documentation-auth/session";
import { listApiKeyMetadata } from "@/lib/enterprise/api-keys";
import { listEnterpriseAuditEvents } from "@/lib/enterprise/audit";
import { resolveOrganizationContext } from "@/lib/enterprise/organization-context";
import {
  listChangeRequests,
  listConfigVersions,
  listControlPlaneResources,
} from "@/lib/enterprise/repository";
import { ENTERPRISE_PERMISSIONS } from "@/lib/enterprise/types";
import { authorizeEnterprise } from "@/lib/enterprise/policy";

export const dynamic = "force-dynamic";

export default async function DocumentationAgentApisPage() {
  const session = await getAppSession();
  if (!session) notFound();
  let context;
  try {
    context = await resolveOrganizationContext(session);
  } catch {
    notFound();
  }
  const resources = (
    await listControlPlaneResources(context.organization.id)
  ).filter((resource) => resource.resourceType === "docs-agent");
  const [changes, credentials, audit] = await Promise.all([
    listChangeRequests(context.organization.id, 100),
    listApiKeyMetadata(context.organization.id),
    listEnterpriseAuditEvents(context.organization.id, 50),
  ]);
  const resourcesWithVersions = await Promise.all(
    resources.map(async (resource) => ({
      ...resource,
      versions: await listConfigVersions(context.organization.id, resource.id),
    }))
  );
  const capabilities = ENTERPRISE_PERMISSIONS.filter((permission) =>
    authorizeEnterprise(context.principal, permission, {
      organizationId: context.organization.id,
    })
  );

  return (
    <DocumentationAgentDashboard
      organization={{ name: context.organization.name }}
      currentUserId={context.principal.userId}
      capabilities={capabilities}
      resources={resourcesWithVersions}
      changes={changes}
      credentials={credentials}
      audit={audit}
    />
  );
}
