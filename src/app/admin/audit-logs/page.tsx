import { AuditLogsPage } from "@/components/admin/pages/AuditLogsPage";
import { listEnterpriseAuditEvents } from "@/lib/enterprise/audit";
import { requireAdminPageContext, requirePermission } from "@/lib/admin/page-data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { context, capabilities } = await requireAdminPageContext();
  requirePermission(capabilities, "audit.read");
  const audit = await listEnterpriseAuditEvents(context.organization.id, 200);
  return <AuditLogsPage audit={audit} />;
}
