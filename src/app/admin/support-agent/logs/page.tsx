import { SupportAgentLogsPage } from "@/components/admin/pages/SupportAgentPages";
import { requireAdminPageContext } from "@/lib/admin/page-data";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireAdminPageContext();
  return <SupportAgentLogsPage />;
}
