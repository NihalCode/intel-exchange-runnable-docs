import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { isAuthEnabled } from "@/lib/documentation-auth/config";
import { accessDeniedPath, type AppSessionResult } from "@/lib/documentation-auth/session";
import { auth0LoginPath } from "@/lib/documentation-auth/sign-in-url";
import {
  resolveWorkspaceSession,
  type WorkspaceSession,
} from "@/lib/documentation-auth/workspace-session";

function safeReturnTo(value: string | undefined): string {
  const raw = value?.trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/";
  }
  return raw;
}

function redirectForMissingSession(result: AppSessionResult, returnTo: string): never {
  if (result.accessDenied) {
    redirect(accessDeniedPath(result.accessDenied.reason));
  }
  if (result.auth0Authenticated) {
    redirect(`/post-login?returnTo=${encodeURIComponent(returnTo)}`);
  }
  redirect(auth0LoginPath(returnTo));
}

/** Returns workspace session or redirects to sign-in / access-denied flows. */
export async function requireProtectedWorkspaceSession(): Promise<WorkspaceSession> {
  if (!isAuthEnabled()) {
    throw new Error("requireProtectedWorkspaceSession called with auth disabled");
  }

  const headerStore = await headers();
  const returnTo = safeReturnTo(headerStore.get("x-pathname") ?? undefined);
  const resolved = await resolveWorkspaceSession();
  if (resolved.ok) return resolved.workspace;
  redirectForMissingSession(resolved.result, returnTo);
}

export async function requireProtectedWorkspace(): Promise<void> {
  if (!isAuthEnabled()) return;

  const headerStore = await headers();
  const returnTo = safeReturnTo(headerStore.get("x-pathname") ?? undefined);
  const resolved = await resolveWorkspaceSession();
  if (resolved.ok) return;
  redirectForMissingSession(resolved.result, returnTo);
}

/** Non-redirecting lookup for server components that need org context. */
export async function getProtectedWorkspaceSession(): Promise<WorkspaceSession | null> {
  if (!isAuthEnabled()) return null;
  const resolved = await resolveWorkspaceSession();
  return resolved.ok ? resolved.workspace : null;
}
