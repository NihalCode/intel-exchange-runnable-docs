import {
  authEnvValidationError,
  isAuthEnvComplete,
} from "@/lib/documentation-auth/env";
import { isAuthDisabled } from "@/lib/documentation-auth/config";
import { buildAuthSetupStatus } from "@/lib/documentation-auth/setup-status";
import { probeDatabase } from "@/lib/db/client";
import {
  AUTH_SETUP_ADMIN_MESSAGE,
  SIGN_IN_NOT_CONFIGURED_MESSAGE,
  sanitizeUserFacingMessage,
} from "@/lib/user-facing-errors";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ERROR_COPY: Record<string, string> = {
  invalid_state:
    "Sign-in could not be verified. Click a sign-in option below and complete login in this same tab.",
  auth_failed: "Sign-in could not be completed. Choose a sign-in option below to try again.",
  auth_denied: "Sign-in was cancelled or denied.",
  auth_config: SIGN_IN_NOT_CONFIGURED_MESSAGE,
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
function auth0LoginUrl(
  connection?: string,
  returnTo?: string,
  /** When true, force interactive login so silent SSO cannot reuse a denied session. */
  forceLogin = false
): string {
  const params = new URLSearchParams();
  if (connection) params.set("connection", connection);
  if (returnTo) params.set("returnTo", returnTo);
  if (forceLogin) {
    params.set("prompt", "login");
    params.set("max_age", "0");
  }
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

  if (!authReady && setup.missingForSignIn.length > 0) {
    console.warn("[sign-in] Auth environment incomplete", {
      missingForSignIn: setup.missingForSignIn,
      missingRecommended: setup.missingRecommended,
    });
  }

  const errorText =
    (customMessage
      ? sanitizeUserFacingMessage(customMessage, SIGN_IN_NOT_CONFIGURED_MESSAGE)
      : null) ||
    (errorCode ? (ERROR_COPY[errorCode] ?? ERROR_COPY.auth_failed) : null) ||
    (!authReady
      ? sanitizeUserFacingMessage(configIssue, SIGN_IN_NOT_CONFIGURED_MESSAGE)
      : null);

  // No error → Auth0 directly so SSO can complete silently across product hosts
  // after the first password/MFA login (avoids a branded interstitial every tab).
  if (authReady && !errorText) {
    redirect(auth0LoginUrl(undefined, returnTo || "/"));
  }

  const googleConnection = process.env.AUTH0_GOOGLE_CONNECTION?.trim();
  const emailConnection = process.env.AUTH0_EMAIL_CONNECTION?.trim();

  return (
    <div className="cx-split-auth" data-layout="cx-split-auth">
      <aside
        className="flex flex-col justify-between bg-[var(--brand-navy-deep)] px-8 py-12 text-white"
        data-layout="cx-sign-in-brand"
      >
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/cyware_logo.png"
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 object-contain"
          />
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.12em] text-white/70">
            CYWARE | Documentation
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-3 max-w-sm text-sm leading-6 text-white/75">
            Access product documentation, Ask AI, and workspace settings with your invited
            company account.
          </p>
        </div>
        <p className="text-xs text-white/50">
          {setup.deployment.productId
            ? `Product context: ${setup.deployment.productId}`
            : "Enterprise documentation workspace"}
        </p>
      </aside>

      <main className="flex items-center justify-center bg-[var(--background-page)] px-4 py-12">
        <div className="w-full max-w-md" data-layout="cx-sign-in-form">
          <h2 className="text-xl font-semibold text-[var(--text-heading)]">Continue</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Sign in with your invited company email.
          </p>
          {errorText ? (
            <div
              role="alert"
              data-testid="login-error"
              className="mt-4 rounded-[var(--radius-md)] border border-red-200 bg-red-50 px-4 py-3 text-left text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
            >
              {errorText}
            </div>
          ) : null}
          {authReady && db.configured && !db.connected ? (
            <div
              role="status"
              data-testid="database-warning"
              className="mt-4 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
            >
              <p className="font-medium">Database unavailable</p>
              <p className="mt-1 text-xs leading-relaxed opacity-90">
                {db.safeMessage ??
                  "Sign-in can start, but user and admin features need a working database connection."}
              </p>
            </div>
          ) : null}
          {!authReady ? (
            <div
              className="mt-4 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
              data-testid="auth-setup-checklist"
            >
              <p className="font-medium">{AUTH_SETUP_ADMIN_MESSAGE}</p>
              <p className="mt-2 text-xs leading-relaxed opacity-90">
                If you manage this deployment, verify Auth0 application settings, callback URLs, and
                database connectivity, then redeploy.
              </p>
            </div>
          ) : null}
          {authReady ? (
            <div className="mt-6 flex flex-col gap-3">
              <a
                href={auth0LoginUrl(
                  googleConnection || "google-oauth2",
                  returnTo,
                  Boolean(errorText)
                )}
                data-testid="login-continue-google"
                className="inline-flex items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--accent-primary-hover)]"
              >
                Continue with Google
              </a>
              <a
                href={auth0LoginUrl(emailConnection, returnTo, Boolean(errorText))}
                data-testid="login-continue-email"
                className="inline-flex items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-4 py-2.5 text-sm font-medium text-[var(--text-heading)] hover:bg-[var(--surface-muted)]"
              >
                Continue with company email
              </a>
            </div>
          ) : (
            <p className="mt-6 text-left text-xs text-[var(--text-muted)]">
              Sign-in options appear after an administrator finishes authentication setup for this
              site.
            </p>
          )}
          <p
            className="mt-6 text-xs leading-relaxed text-[var(--text-muted)]"
            data-testid="login-invite-note"
          >
            Need access? Ask a documentation workspace administrator for an invite.
          </p>
        </div>
      </main>
    </div>
  );
}
