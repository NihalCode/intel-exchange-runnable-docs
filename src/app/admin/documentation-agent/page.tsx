import { DocumentationAgentOverviewPage } from "@/components/admin/pages/DocumentationAgentOverviewPage";
import { requireAdminPageContext } from "@/lib/admin/page-data";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireAdminPageContext();
  return <DocumentationAgentOverviewPage />;
}
