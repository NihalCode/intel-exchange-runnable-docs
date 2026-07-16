import { notFound } from "next/navigation";

import { requireProtectedWorkspace } from "@/lib/documentation-auth/protect-layout";
import { getAppSession } from "@/lib/documentation-auth/session";
import { hasPermission } from "@/lib/documentation-auth/permissions";

export default async function SettingsContentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireProtectedWorkspace();
  const session = await getAppSession();
  if (
    !session ||
    (!hasPermission(session.user.role, "sync_docs") &&
      !hasPermission(session.user.role, "manage_sources"))
  ) {
    notFound();
  }
  return children;
}
