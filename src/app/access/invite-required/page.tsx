import { AccessPage } from "@/components/auth/AccessPage";

export default function InviteRequiredPage() {
  return (
    <AccessPage
      testId="access-invite-required"
      signInError="invite_required"
      title="Invite required"
      description="This documentation workspace is invite-only. Ask an administrator to invite your email before signing in."
    />
  );
}
