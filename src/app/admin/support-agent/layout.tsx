import {
  requireAdminFeature,
  requireAdminPageContext,
} from "@/lib/admin/page-data";

export default async function SupportAgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { context } = await requireAdminPageContext();
  await requireAdminFeature(context.organization.id, "support_agent");
  return children;
}
