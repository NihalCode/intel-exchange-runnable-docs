import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getAppSessionResult } from "@/lib/documentation-auth/session";
import { checkStepUpAuthentication } from "@/lib/enterprise/auth-assurance";
import { resolveOrganizationContext } from "@/lib/enterprise/organization-context";
import { authorizeEnterprise } from "@/lib/enterprise/policy";

export const metadata: Metadata = {
  title: "Enterprise administration",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const result = await getAppSessionResult();
  if (!result.session) {
    if (!result.auth0Authenticated && !result.accessDenied) redirect("/sign-in");
    return <ForbiddenState />;
  }

  let allowed = false;
  try {
    const context = await resolveOrganizationContext(result.session);
    allowed =
      authorizeEnterprise(context.principal, "admin_dashboard.access", {
        organizationId: context.organization.id,
      }) &&
      checkStepUpAuthentication(result.session, { requireMfa: true }).ok;
  } catch {
    allowed = false;
  }
  if (!allowed) return <ForbiddenState />;
  return children;
}

function ForbiddenState() {
  return (
    <main className="mx-auto max-w-2xl py-16" aria-labelledby="access-heading">
      <h1 id="access-heading" className="text-2xl font-semibold">
        This workspace is unavailable
      </h1>
      <p className="mt-3 text-zinc-600 dark:text-zinc-300">
        You do not have access to this administrative workspace. Confirm your
        active organization, membership, role, and multi-factor authentication.
      </p>
    </main>
  );
}
