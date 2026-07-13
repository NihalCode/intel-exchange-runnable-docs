import { Suspense } from "react";

import { AdminLayoutClient } from "@/components/admin/shell/AdminLayoutClient";
import { LoadingSkeleton } from "@/components/admin/ui/EmptyState";
import { getAppSessionResult } from "@/lib/documentation-auth/session";
import { checkStepUpAuthentication } from "@/lib/enterprise/auth-assurance";
import { resolveOrganizationContext } from "@/lib/enterprise/organization-context";
import { authorizeEnterprise } from "@/lib/enterprise/policy";
import { ENTERPRISE_PERMISSIONS } from "@/lib/enterprise/types";

export { metadata } from "./metadata";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const result = await getAppSessionResult();
  if (!result.session) {
    if (!result.auth0Authenticated && !result.accessDenied) {
      const { redirect } = await import("next/navigation");
      redirect("/sign-in");
    }
    return <ForbiddenState />;
  }

  let allowed = false;
  let orgContext;
  try {
    orgContext = await resolveOrganizationContext(result.session);
    allowed =
      authorizeEnterprise(orgContext.principal, "admin_dashboard.access", {
        organizationId: orgContext.organization.id,
      }) &&
      checkStepUpAuthentication(result.session, { requireMfa: true }).ok;
  } catch {
    allowed = false;
  }
  if (!allowed || !orgContext) return <ForbiddenState />;

  const capabilities = ENTERPRISE_PERMISSIONS.filter((permission) =>
    authorizeEnterprise(orgContext.principal, permission, {
      organizationId: orgContext.organization.id,
    })
  );

  return (
    <AdminLayoutClient
      organization={{
        id: orgContext.organization.id,
        name: orgContext.organization.name,
        slug: orgContext.organization.slug,
      }}
      user={{
        id: orgContext.principal.userId,
        email: result.session.user.email,
        role: orgContext.principal.role,
      }}
      capabilities={capabilities}
    >
      <Suspense fallback={<LoadingSkeleton rows={8} />}>{children}</Suspense>
    </AdminLayoutClient>
  );
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
