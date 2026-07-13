import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { isAuthEnabled } from "@/lib/documentation-auth/config";
import { accessDeniedPath, getAppSessionResult } from "@/lib/documentation-auth/session";

function safeReturnTo(value: string | undefined): string {
  const raw = value?.trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/";
  }
  return raw;
}

export async function requireProtectedWorkspace(): Promise<void> {
  if (!isAuthEnabled()) return;

  const headerStore = await headers();
  const returnTo = safeReturnTo(headerStore.get("x-pathname") ?? undefined);

  const result = await getAppSessionResult();
  if (result.session) return;

  if (result.accessDenied) {
    redirect(accessDeniedPath(result.accessDenied.reason));
  }

  if (result.auth0Authenticated) {
    redirect(`/post-login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  redirect(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
}
