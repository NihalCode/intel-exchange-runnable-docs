import { AccessPage } from "@/components/auth/AccessPage";

export default function DisabledPage() {
  return (
    <AccessPage
      testId="access-disabled"
      title="Access disabled"
      description="Your access to this documentation workspace has been disabled. Contact your administrator."
    />
  );
}
