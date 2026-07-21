import {
  authEnvValidationError,
  isAuthEnvComplete,
} from "@/lib/documentation-auth/env";
import { isAuthDisabled } from "@/lib/documentation-auth/config";
import { buildAuthSetupStatus } from "@/lib/documentation-auth/setup-status";
import { probeDatabase } from "@/lib/db/client";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ERROR_COPY: Record<string, string> = {
  invalid_state:
    "Sign-in could not be verified. Click a sign-in option below and complete login in this same tab.",
  auth_failed: "Sign-in could not be completed. Choose a sign-in option below to try again.",
  auth_denied: "Sign-in was cancelled or denied.",
  auth_config:
    "Sign-in is misconfigured on this deployment. Verify Auth0 env vars and APP_BASE_URL in Vercel, then redeploy.",
  invite_required:
    "This documentation workspace is invite-only. Ask an administrator to invite your email before signing in.",
  expired_invite:
    "Your invite has expired. Ask an administrator to send a new invite before signing in.",
  disabled:
    "Your account has been disabled. Contact a workspace administrator for access.",
  wrong_email:
    "You signed in with a different email than the one that was invited. Use the invited email address.",
  not_invited:
    "This documentation workspace is invite-only. Ask an administrator to invite your email before signing in.",
};

/** Auth0 SDK route — must not be a Next.js page or OAuth never starts. */
function auth0LoginUrl(connection?: string, returnTo?: string): string {
  const params = new URLSearchParams();
  if (connection) params.set("connection", connection);
  if (returnTo) params.set("returnTo", returnTo);
  const qs = params.toString();
  return qs ? `/auth/login?${qs}` : "/auth/login";
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; returnTo?: string }>;
}) {
  const params = await searchParams;
  const errorCode = params.error?.trim();
  const customMessage = params.message?.trim();
  const returnTo = params.returnTo?.trim();
  const authReady = isAuthDisabled() || isAuthEnvComplete();
  const configIssue = authEnvValidationError();

  const db = await probeDatabase();
  const setup = buildAuthSetupStatus({ databaseConnected: db.connected });

  const errorText =
    customMessage ||
    (errorCode ? (ERROR_COPY[errorCode] ?? ERROR_COPY.auth_failed) : null) ||
    (!authReady && configIssue ? configIssue : null);

  // No error → Auth0 directly so SSO can complete silently across product hosts
  // after the first password/MFA login (avoids a branded interstitial every tab).
  if (authReady && !errorText) {
    redirect(auth0LoginUrl(undefined, returnTo || "/"));
  }

  const googleConnection = process.env.AUTH0_GOOGLE_CONNECTION?.trim();
  const emailConnection = process.env.AUTH0_EMAIL_CONNECTION?.trim();

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background-page)] px-4 py-12">
      <div className="cx-card w-full max-w-md p-8 text-center">
        <div className="mb-6 flex flex-col items-center justify-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/cyware_logo.png"
            alt="Cyware"
            width={48}
            height={48}
            className="h-12 w-12 object-contain"
          />
          <span className="text-sm font-semibold text-[var(--text-heading)]">
            Cyware API Docs
            {setup.deployment.productId ? (
              <span className="ml-1 font-normal text-[var(--text-muted)]">
                ({setup.deployment.productId})
              </span>
            ) : null}
          </span>
        </div>
        <h1 className="text-2xl font-semibold text-[var(--text-heading)]">Sign in</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Sign in with your invited company email.
        </p>
        {errorText ? (
          <div
            role="alert"
            data-testid="login-error"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-left text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          >
            {errorText}
          </div>
        ) : null}
        {authReady && db.configured && !db.connected ? (
          <div
            role="status"
            data-testid="database-warning"
            className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
          >
            <p className="font-medium">Database unavailable</p>
            <p className="mt-1 text-xs leading-relaxed opacity-90">
              {db.safeMessage ??
                "Auth0 can start, but user/admin provisioning needs a working DATABASE_URL."}
            </p>
          </div>
        ) : null}
        {!authReady ? (
          <div
            className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
            data-testid="auth-setup-checklist"
          >
            <p className="font-medium">This Vercel project is missing required configuration.</p>
            {setup.deployment.resolvedAppBaseUrl ? (
              <p className="mt-2 text-xs opacity-90">
                Deployment URL: <code>{setup.deployment.resolvedAppBaseUrl}</code>
              </p>
            ) : null}
            {setup.missingForSignIn.length > 0 ? (
              <>
                <p className="mt-3 text-xs font-medium uppercase tracking-wide opacity-80">
                  Required for sign-in (set on this project, then redeploy)
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
                  {setup.missingForSignIn.map((item) => (
                    <li key={item}>
                      <code>{item}</code>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {setup.missingRecommended.length > 0 ? (
              <>
                <p className="mt-3 text-xs font-medium uppercase tracking-wide opacity-80">
                  Required for admin + deployments
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
                  {setup.missingRecommended.map((item) => (
                    <li key={item}>
                      <code>{item}</code>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <p className="mt-3 text-xs leading-relaxed opacity-90">
              Copy the same Auth0 and database variables from your main docs project to{" "}
              <strong>each</strong> product Vercel project ({`cyware-docs-ctix`},{" "}
              {`cyware-docs-csap`}, {`cyware-docs-cftr`}, {`cyware-docs-orchestrate`}), or run{" "}
              <code>npm run vercel:sync-product-env</code> locally with{" "}
              <code>VERCEL_TOKEN</code>.
            </p>
          </div>
        ) : null}
        {authReady ? (
          <div className="mt-6 flex flex-col gap-3">
            <a
              href={auth0LoginUrl(googleConnection || "google-oauth2", returnTo)}
              data-testid="login-continue-google"
              className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Continue with Google
            </a>
            <a
              href={auth0LoginUrl(emailConnection, returnTo)}
              data-testid="login-continue-email"
              className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Continue with company email
            </a>
          </div>
        ) : (
          <p className="mt-6 text-left text-xs text-zinc-500 dark:text-zinc-400">
            Sign-in buttons appear after Auth0 environment variables are configured on this Vercel
            project and you redeploy.
          </p>
        )}
        <p
          className="mt-6 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400"
          data-testid="login-invite-note"
        >
          Need access? Ask a documentation workspace administrator for an invite.
        </p>
      </div>
    </main>
  );
}
