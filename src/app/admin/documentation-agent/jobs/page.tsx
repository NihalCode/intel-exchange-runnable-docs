import { notFound } from "next/navigation";

import { AdminSubNav } from "@/components/admin/AdminSubNav";
import { JobsDashboard } from "@/components/admin/JobsDashboard";
import { getAppSession } from "@/lib/documentation-auth/session";
import { resolveOrganizationContext } from "@/lib/enterprise/organization-context";
import { authorizeEnterprise } from "@/lib/enterprise/policy";
import { listJobs } from "@/lib/enterprise/repository";
import { ENTERPRISE_PERMISSIONS } from "@/lib/enterprise/types";

export const dynamic = "force-dynamic";

export default async function DocumentationAgentJobsPage() {
  const session = await getAppSession();
  if (!session) notFound();
  let context;
  try {
    context = await resolveOrganizationContext(session);
  } catch {
    notFound();
  }
  if (
    !authorizeEnterprise(context.principal, "jobs.read", {
      organizationId: context.organization.id,
    })
  ) {
    notFound();
  }
  const jobs = await listJobs(context.organization.id, 100);
  const capabilities = ENTERPRISE_PERMISSIONS.filter((permission) =>
    authorizeEnterprise(context.principal, permission, {
      organizationId: context.organization.id,
    })
  );

  return (
    <main className="mx-auto max-w-5xl space-y-8" aria-labelledby="jobs-page-title">
      <header>
        <p className="text-sm font-medium text-sky-700 dark:text-sky-300">
          {context.organization.name}
        </p>
        <h1 id="jobs-page-title" className="mt-1 text-3xl font-semibold tracking-tight">
          Documentation Agent Jobs
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          Monitor queued background work and manually process due scheduled changes.
        </p>
      </header>
      <AdminSubNav capabilities={capabilities} />
      <JobsDashboard jobs={jobs} capabilities={capabilities} />
    </main>
  );
}
