import { DocumentationSchemasPage } from "@/components/admin/pages/DocumentationSchemasPage";
import {
  requireAdminPageContext,
  requirePermission,
} from "@/lib/admin/page-data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { context, capabilities } = await requireAdminPageContext();
  requirePermission(capabilities, "schemas.read");
  return (
    <DocumentationSchemasPage
      currentUserId={context.principal.userId}
      canManage={capabilities.includes("schemas.manage")}
      canReview={capabilities.includes("schemas.review")}
      canPublish={capabilities.includes("schemas.publish")}
    />
  );
}
