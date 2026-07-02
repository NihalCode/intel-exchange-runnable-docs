import { redirect } from "next/navigation";

import {
  accessDeniedPath,
  getAppSessionResult,
} from "@/lib/documentation-auth/session";

export const dynamic = "force-dynamic";

function safeReturnTo(value: string | undefined): string {
  const raw = value?.trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/";
  }
  return raw;
}

/** After Auth0 callback — bootstrap invite-only app session on Node.js (Postgres/SQLite). */
export default async function PostLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const params = await searchParams;
  const returnTo = safeReturnTo(params.returnTo);

  const result = await getAppSessionResult();

  if (result.session) {
    redirect(returnTo);
  }

  if (result.accessDenied) {
    const path = accessDeniedPath(result.accessDenied.reason);
    if (result.accessDenied.invitedEmail && path === "/access/wrong-email") {
      redirect(`${path}?email=${encodeURIComponent(result.accessDenied.invitedEmail)}`);
    }
    redirect(path);
  }

  if (!result.auth0Authenticated) {
    redirect(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  }

  redirect("/access/invite-required");
}
