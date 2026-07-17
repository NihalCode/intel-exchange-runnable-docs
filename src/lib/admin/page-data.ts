import "server-only";

import { notFound, redirect } from "next/navigation";

import {
  buildOverviewActivity,
  buildOverviewHealth,
  buildOverviewMetrics,
} from "@/lib/admin/overview-data";
import { db } from "@/lib/db/client";
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
import type { DocumentationFeatureKey } from "@/lib/documentation-features/keys";
import {
  resolveDocumentationFeatureEnabled,
} from "@/lib/documentation-features/resolve-enabled";

export async function requireAdminPageContext() {
  const session = await getAppSession();
  if (!session) redirect("/sign-in?returnTo=/admin");
  let context;
  try {
    context = await resolveOrganizationContext(session);
  } catch {
    redirect("/sign-in?returnTo=/admin");
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

export async function requireAdminFeature(
  organizationId: string,
  key: DocumentationFeatureKey,
  options?: { role?: string; environment?: string }
) {
  if (
    !(await resolveDocumentationFeatureEnabled({
      organizationId,
      key,
      role: options?.role,
      environment: options?.environment,
    }))
  ) {
    notFound();
  }
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

export async function loadOverviewDashboardData(organizationId: string) {
  const dbStarted = Date.now();
  let databaseOk = false;
  try {
    await db.queryOne("SELECT 1 AS ok");
    databaseOk = true;
  } catch {
    databaseOk = false;
  }
  const databaseLatencyMs = Date.now() - dbStarted;

  const [resources, changes, jobs, audit] = await Promise.all([
    listControlPlaneResources(organizationId),
    listChangeRequests(organizationId, 200),
    listJobs(organizationId, 200),
    listEnterpriseAuditEvents(organizationId, 200),
  ]);

  return {
    metrics: buildOverviewMetrics({ resources, changes, jobs, audit }),
    health: buildOverviewHealth({ databaseOk, databaseLatencyMs, jobs }),
    activity: buildOverviewActivity(audit),
  };
}

export async function loadJobs(organizationId: string) {
  return listJobs(organizationId, 100);
}

export async function loadSecuritySettings(organizationId: string) {
  return getSecuritySettings(organizationId);
}
