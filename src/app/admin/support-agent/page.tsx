import { SupportAgentOverviewPage } from "@/components/admin/pages/SupportAgentOverviewPage";
import { requireAdminPageContext } from "@/lib/admin/page-data";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireAdminPageContext();
  return <SupportAgentOverviewPage />;
}
