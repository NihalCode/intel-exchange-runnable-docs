import Link from "next/link";

import { listCredentialMetadata } from "@/lib/documentation-credentials/repository";
import {
  requireAdminPageContext,
  requirePermission,
} from "@/lib/admin/page-data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { context, capabilities } = await requireAdminPageContext();
  requirePermission(capabilities, "credentials.read_metadata");
  const ownCredentials = await listCredentialMetadata(
    context.organization.id,
    context.principal.userId
  );
  return (
    <div>
      <h1 className="text-2xl font-semibold">Authentication policy</h1>
      <p className="mt-1 text-sm text-zinc-500">Credentials are per-user, provider validated, encrypted at rest, and never exposed through admin APIs.</p>
      <div className="mt-6 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
        <p className="text-sm"><strong>Your connections:</strong> {ownCredentials.filter((item) => item.status === "valid").length} valid of {ownCredentials.length} configured.</p>
        <Link href="/authentication" className="mt-3 inline-flex text-sm font-medium text-sky-600">Manage your connections →</Link>
      </div>
    </div>
  );
}
