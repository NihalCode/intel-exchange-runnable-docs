import type { AppSession } from "@/lib/documentation-auth/session";

export const ANONYMOUS_VIEWER_USER_ID = "anonymous-viewer";

/** Synthetic workspace session for unsigned Ask AI / docs viewers. */
export function anonymousViewerSession(): AppSession {
  return {
    user: {
      id: ANONYMOUS_VIEWER_USER_ID,
      auth0UserId: "anonymous|viewer",
      email: "anonymous@viewer.local",
      name: "Anonymous viewer",
      role: "viewer",
      status: "active",
    },
    authProvider: "disabled",
  };
}

export function isAnonymousViewerSession(
  session: Pick<AppSession, "user"> | null | undefined
): boolean {
  return session?.user.id === ANONYMOUS_VIEWER_USER_ID;
}
