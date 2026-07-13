import { getDocumentationFeature } from "@/lib/documentation-features";
import {
  requireAdminPageContext,
  requirePermission,
} from "@/lib/admin/page-data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { context, capabilities } = await requireAdminPageContext();
  requirePermission(capabilities, "jobs.read");
  const feature = await getDocumentationFeature(
    context.organization.id,
    "vercel_deployment"
  );
  return (
    <div>
      <h1 className="text-2xl font-semibold">Deployments</h1>
      {!feature.enabled ? (
        <div className="mt-6 rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
          <h2 className="font-semibold">Deployments are disabled</h2>
          <p className="mt-2 text-sm text-zinc-500">Enable vercel_deployment in Documentation Features before deployment controls or APIs become available.</p>
        </div>
      ) : (
        <p className="mt-4 text-sm text-zinc-500">Deployment is enabled. Production actions remain permission and approval gated.</p>
      )}
    </div>
  );
}
