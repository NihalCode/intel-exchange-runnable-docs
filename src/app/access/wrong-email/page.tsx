import { redirect } from "next/navigation";

import { AccessPage } from "@/components/auth/AccessPage";
import { getAppSessionResult } from "@/lib/documentation-auth/session";

export const dynamic = "force-dynamic";

export default async function WrongEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const result = await getAppSessionResult();
  // Anonymous visitors who bookmarked / opened this URL should land on the hub,
  // not a mid-auth failure gate.
  if (!result.auth0Authenticated) {
    redirect("/");
  }

  const params = await searchParams;
  const email = params.email?.trim() || "the invited email";
  return (
    <AccessPage
      testId="access-wrong-email"
      signInError="wrong_email"
      title="Wrong email for this invite"
      description={`This invite was created for ${email}. Sign in with that email or request a new invite.`}
    />
  );
}
