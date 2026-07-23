import { redirect } from "next/navigation";

import { passwordLoginPath } from "@/lib/documentation-auth/password-connection";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * First-time users: Auth0 Universal Login signup (email + password only).
 * `connection=` forces Database so Google / Okta buttons do not appear.
 */
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; email?: string }>;
}) {
  const params = await searchParams;
  const returnTo = params.returnTo?.trim();
  redirect(passwordLoginPath({ returnTo, signUp: true, forceLogin: true }));
}
