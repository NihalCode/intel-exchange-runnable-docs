import "server-only";

import { notFound } from "next/navigation";

import { getAppSession } from "@/lib/documentation-auth/session";
import { listApiKeyMetadata } from "@/lib/enterprise/api-keys";
import { listEnterpriseAuditEvents } from "@/lib/enterprise/audit";
import { resolveOrganizationContext } from "@/lib/enterprise/organization-context";
import {
  listChangeRequests,
  listConfigVersions,
  listControlPlaneResources,
  listJobs,
} from "@/lib/enterprise/repository";
import { getSecuritySettings } from "@/lib/enterprise/security-settings";
import { authorizeEnterprise } from "@/lib/enterprise/policy";
import { ENTERPRISE_PERMISSIONS, type EnterprisePermission } from "@/lib/enterprise/types";

export async function requireAdminPageContext() {
  const session = await getAppSession();
  if (!session) notFound();
  let context;
  try {
    context = await resolveOrganizationContext(session);
  } catch {
    notFound();
  }
  const capabilities = ENTERPRISE_PERMISSIONS.filter((permission) =>
    authorizeEnterprise(context.principal, permission, {
      organizationId: context.organization.id,
    })
  );
  return { session, context, capabilities };
}

export function requirePermission(
  capabilities: EnterprisePermission[],
  permission: EnterprisePermission
) {
  if (!capabilities.includes(permission)) notFound();
}

export async function loadDocsAgentResources(organizationId: string) {
  const resources = (
    await listControlPlaneResources(organizationId)
  ).filter((resource) => resource.resourceType === "docs-agent");
  return Promise.all(
    resources.map(async (resource) => ({
      ...resource,
      versions: await listConfigVersions(organizationId, resource.id),
    }))
  );
}

export async function loadDocsAgentDashboardData(organizationId: string) {
  const [resources, changes, credentials, audit] = await Promise.all([
    loadDocsAgentResources(organizationId),
    listChangeRequests(organizationId, 100),
    listApiKeyMetadata(organizationId),
    listEnterpriseAuditEvents(organizationId, 50),
  ]);
  return { resources, changes, credentials, audit };
}

export async function loadJobs(organizationId: string) {
  return listJobs(organizationId, 100);
}

export async function loadSecuritySettings(organizationId: string) {
  return getSecuritySettings(organizationId);
}
