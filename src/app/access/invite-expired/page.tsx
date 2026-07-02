import { AccessPage } from "@/components/auth/AccessPage";

export default function InviteExpiredPage() {
  return (
    <AccessPage
      testId="access-invite-expired"
      title="Invite expired"
      description="Ask an administrator to send a new invite."
    />
  );
}
