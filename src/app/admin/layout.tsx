import { Suspense } from "react";
import Link from "next/link";

import { AdminLayoutClient } from "@/components/admin/shell/AdminLayoutClient";
import { LoadingSkeleton } from "@/components/admin/ui/EmptyState";
import { getAppSessionResult } from "@/lib/documentation-auth/session";
import { isAuthDisabled } from "@/lib/documentation-auth/config";
import {
  authEnvValidationError,
  isAuthEnvComplete,
} from "@/lib/documentation-auth/env";
import {
  evaluateAdminAccess,
  type AdminAccessDenialReason,
} from "@/lib/enterprise/admin-access";
import { ENTERPRISE_PERMISSIONS } from "@/lib/enterprise/types";
import { authorizeEnterprise } from "@/lib/enterprise/policy";
import { listResolvedEnabledFeatureKeys } from "@/lib/documentation-features/resolve-enabled";

export { metadata } from "./metadata";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isAuthDisabled() && !isAuthEnvComplete()) {
    return (
      <AuthConfigRequired
        issue={
          authEnvValidationError() ??
          "Auth0 is not configured. Add Auth0 environment variables in Vercel for this project."
        }
      />
    );
  }

  const result = await getAppSessionResult();
  if (!result.session) {
    if (!result.auth0Authenticated && !result.accessDenied) {
      const { redirect } = await import("next/navigation");
      redirect("/sign-in?returnTo=/admin");
    }
    return <ForbiddenState reason="no_session" />;
  }

  const access = await evaluateAdminAccess(result.session);
  if (!access.allowed || !access.organizationContext) {
    return (
      <ForbiddenState
        reason={access.reason ?? "missing_permission"}
        workspaceRole={access.workspaceRole}
        enterpriseRole={access.enterpriseRole}
        mfaMethods={access.mfaMethods}
      />
    );
  }

  const orgContext = access.organizationContext;
  const capabilities = ENTERPRISE_PERMISSIONS.filter((permission) =>
    authorizeEnterprise(orgContext.principal, permission, {
      organizationId: orgContext.organization.id,
    })
  );
  const enabledFeatures = await listResolvedEnabledFeatureKeys(
    orgContext.organization.id,
    orgContext.principal.role
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
      enabledFeatures={enabledFeatures}
    >
      <Suspense fallback={<LoadingSkeleton rows={8} />}>{children}</Suspense>
    </AdminLayoutClient>
  );
}

function AuthConfigRequired({ issue }: { issue: string }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16" aria-labelledby="auth-config-heading">
      <h1 id="auth-config-heading" className="text-2xl font-semibold">
        Sign-in is not configured for this deployment
      </h1>
      <p className="mt-3 text-zinc-600 dark:text-zinc-300">{issue}</p>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-zinc-600 dark:text-zinc-300">
        <li>
          In Vercel → this project → Settings → Environment Variables, set{" "}
          <code className="text-xs">AUTH0_ISSUER_BASE_URL</code>,{" "}
          <code className="text-xs">AUTH0_CLIENT_ID</code>,{" "}
          <code className="text-xs">AUTH0_CLIENT_SECRET</code>, and{" "}
          <code className="text-xs">AUTH0_SECRET</code> (32+ chars).
        </li>
        <li>
          Set <code className="text-xs">APP_BASE_URL</code> to this site&apos;s URL, e.g.{" "}
          <code className="text-xs">https://cyware-docs-csap.vercel.app</code> (or rely on{" "}
          <code className="text-xs">VERCEL_URL</code> after redeploy).
        </li>
        <li>Add this URL to Auth0 Allowed Callback URLs as{" "}
          <code className="text-xs">{'{APP_BASE_URL}'}/auth/callback</code>.
        </li>
        <li>Redeploy after saving env vars.</li>
      </ul>
      <div className="mt-6">
        <Link
          href="/"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          Back to documentation
        </Link>
      </div>
    </main>
  );
}

function ForbiddenState({
  reason,
  workspaceRole,
  enterpriseRole,
  mfaMethods,
}: {
  reason: AdminAccessDenialReason;
  workspaceRole?: string;
  enterpriseRole?: string | null;
  mfaMethods?: string[];
}) {
  const copy = denialCopy(reason, workspaceRole, enterpriseRole, mfaMethods);

  return (
    <main className="mx-auto max-w-2xl px-4 py-16" aria-labelledby="access-heading">
      <h1 id="access-heading" className="text-2xl font-semibold">
        {copy.title}
      </h1>
      <p className="mt-3 text-zinc-600 dark:text-zinc-300">{copy.body}</p>
      {copy.steps.length > 0 ? (
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-zinc-600 dark:text-zinc-300">
          {copy.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
      ) : null}
      <div className="mt-6 flex flex-wrap gap-3">
        {copy.showSignInAgain ? (
          <Link
            href="/auth/login?returnTo=/admin"
            className="rounded-md bg-sky-700 px-3 py-2 text-sm font-medium text-white hover:bg-sky-800"
          >
            Sign in again
          </Link>
        ) : null}
        <Link
          href="/"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          Back to documentation
        </Link>
      </div>
    </main>
  );
}

function denialCopy(
  reason: AdminAccessDenialReason,
  workspaceRole?: string,
  enterpriseRole?: string | null,
  mfaMethods?: string[]
): {
  title: string;
  body: string;
  steps: string[];
  showSignInAgain: boolean;
} {
  switch (reason) {
    case "mfa_required":
      return {
        title: "Multi-factor authentication required",
        body:
          "Your workspace role allows administration, but this session was not authenticated with MFA. The admin dashboard requires a fresh sign-in that completes MFA.",
        steps: [
          "Enable MFA for your Auth0 user if it is not already configured.",
          "Sign out and sign in again, completing MFA when prompted.",
          mfaMethods?.length
            ? `Current session methods: ${mfaMethods.join(", ")}.`
            : "This session did not include MFA claims (amr/acr) from Auth0.",
        ].filter(Boolean) as string[],
        showSignInAgain: true,
      };
    case "organization_context":
      return {
        title: "Organization membership could not be verified",
        body:
          "You are signed in, but the enterprise control plane could not resolve your organization membership.",
        steps: [
          "Confirm `DATABASE_URL` points to persistent Postgres in production.",
          "If you use Auth0 Organizations, sign in through the correct organization so `org_id` is present.",
          workspaceRole
            ? `Workspace role: ${workspaceRole}. Enterprise role mapping: ${enterpriseRole ?? "none"}.`
            : "Only owner, admin, and developer roles can access the admin dashboard.",
        ].filter(Boolean) as string[],
        showSignInAgain: false,
      };
    case "missing_permission":
      return {
        title: "Administrator access is not enabled for this account",
        body:
          "The admin dashboard is limited to enterprise owner, admin, and developer roles with an active organization membership.",
        steps: [
          workspaceRole
            ? `Workspace role: ${workspaceRole}.`
            : "Your workspace role may be viewer or documentation manager.",
          enterpriseRole
            ? `Enterprise membership role: ${enterpriseRole}.`
            : "Your enterprise membership role is not owner, admin, or developer.",
        ].filter(Boolean) as string[],
        showSignInAgain: false,
      };
    case "inactive_principal":
      return {
        title: "This administrative account is inactive",
        body: "Your organization membership or account status is not active.",
        steps: ["Ask another owner or administrator to reactivate your account."],
        showSignInAgain: false,
      };
    case "recent_auth_required":
      return {
        title: "Recent sign-in required",
        body:
          "Your session is too old for this action. Sign in again to continue.",
        steps: [
          "Sign out and sign in again to refresh your authentication timestamp.",
        ],
        showSignInAgain: true,
      };
    case "no_session":
      return {
        title: "Sign in required",
        body: "Sign in to access the enterprise admin dashboard.",
        steps: [],
        showSignInAgain: true,
      };
    default:
      return {
        title: "Admin access denied",
        body:
          "You are signed in, but this account cannot open the enterprise admin dashboard.",
        steps: [
          workspaceRole
            ? `Workspace role: ${workspaceRole}.`
            : "Confirm your account has owner, admin, or developer role.",
          enterpriseRole
            ? `Enterprise membership role: ${enterpriseRole}.`
            : "Confirm you belong to an active organization.",
          `Access check: ${reason}.`,
        ],
        showSignInAgain: false,
      };
  }
}
