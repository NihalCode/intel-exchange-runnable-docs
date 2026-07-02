import { redirect } from "next/navigation";

import { isAuthEnabled } from "@/lib/documentation-auth/config";
import { accessDeniedPath, getAppSessionResult } from "@/lib/documentation-auth/session";

export async function requireProtectedWorkspace(): Promise<void> {
  if (!isAuthEnabled()) return;

  const result = await getAppSessionResult();
  if (result.session) return;

  if (result.accessDenied) {
    redirect(accessDeniedPath(result.accessDenied.reason));
  }

  redirect("/sign-in");
}
