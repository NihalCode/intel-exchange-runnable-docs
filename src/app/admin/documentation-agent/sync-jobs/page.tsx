import { DocumentationAgentSyncJobsPage } from "@/components/admin/pages/DocumentationAgentSyncJobsPage";
import { loadJobs, requireAdminPageContext, requirePermission } from "@/lib/admin/page-data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { context, capabilities } = await requireAdminPageContext();
  requirePermission(capabilities, "jobs.read");
  const jobs = await loadJobs(context.organization.id);
  return <DocumentationAgentSyncJobsPage jobs={jobs} capabilities={capabilities} />;
}
