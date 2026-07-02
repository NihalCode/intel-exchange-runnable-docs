import { requireProtectedWorkspace } from "@/lib/documentation-auth/protect-layout";

export const dynamic = "force-dynamic";

export default async function DocsLayout({ children }: { children: React.ReactNode }) {
  await requireProtectedWorkspace();
  return children;
}
