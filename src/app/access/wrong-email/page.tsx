import { AccessPage } from "@/components/auth/AccessPage";

export default async function WrongEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
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
