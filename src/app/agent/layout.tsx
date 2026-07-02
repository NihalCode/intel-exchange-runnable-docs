import { requireProtectedWorkspace } from "@/lib/documentation-auth/protect-layout";

export default async function AgentLayout({ children }: { children: React.ReactNode }) {
  await requireProtectedWorkspace();
  return children;
}
