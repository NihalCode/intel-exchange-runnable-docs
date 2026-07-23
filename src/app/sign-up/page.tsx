import { redirect } from "next/navigation";

import { freshLoginStartHref } from "@/lib/documentation-auth/fresh-login";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** First-time users: clear session, then Auth0 Database signup (email + password). */
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const params = await searchParams;
  redirect(freshLoginStartHref("signup", params.returnTo?.trim()));
}
