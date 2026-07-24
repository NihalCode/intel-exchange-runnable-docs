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
import { freshLoginStartHref } from "@/lib/documentation-auth/fresh-login";
import { SecurityBrandPanel } from "@/components/fabric/SignalField";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ERROR_COPY: Record<string, string> = {
  invalid_state:
    "Sign-in could not be verified. Click Sign in below and complete login in this same tab.",
  auth_failed:
    "Sign-in could not be completed. Try Sign in again, or Sign up first if you have not set a password.",
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
  set_password:
    "Set up your account first. You have been added, but your password has not been created yet. Select Sign up to set your password.",
};

const HINT_COPY: Record<string, string> = {
  set_password:
    "Set up your account first. You have been added, but your password has not been created yet. Select Sign up to set your password.",
  set_password_done:
    "Your account is ready. Sign in with the password you just created.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    message?: string;
    returnTo?: string;
    hint?: string;
  }>;
}) {
  const params = await searchParams;
  const errorCode = params.error?.trim();
  const customMessage = params.message?.trim();
  const returnTo = params.returnTo?.trim();
  const hint = params.hint?.trim();
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

  const hintText = hint ? HINT_COPY[hint] ?? null : null;
  const highlightSignUp =
    hint === "set_password" || errorCode === "set_password" || errorCode === "auth_failed";

  // Clear sticky Auth0/Okta broker session, then Okta Workforce email/password + Verify.
  const signInHref = freshLoginStartHref("login", returnTo);
  const signUpHref = returnTo
    ? `/sign-up?returnTo=${encodeURIComponent(returnTo)}`
    : "/sign-up";

  return (
    <div className="cx-split-auth" data-layout="cx-split-auth">
      <aside
        className="flex flex-col justify-between px-8 py-12 text-white"
        data-layout="cx-sign-in-brand"
      >
        <SecurityBrandPanel className="flex flex-1 flex-col justify-between">
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
            <p className="mt-3 max-w-sm text-sm leading-6 text-white/80">
              Auth0 brokers session continuity for this workspace. Okta owns your password and
              Verify — complete both steps after you continue.
            </p>
            <p className="mt-4 max-w-sm text-sm leading-6 text-white/65">
              This docs workspace is invite-only. Administrators must add your email before you
              can sign in or set a password.
            </p>
          </div>
          <p className="text-xs text-white/50">
            {setup.deployment.productId
              ? `Product context: ${setup.deployment.productId}`
              : "Enterprise documentation workspace"}
          </p>
        </SecurityBrandPanel>
      </aside>

      <main className="sf-atmosphere flex items-center justify-center px-4 py-12">
        <div
          className="sf-access-panel w-full max-w-md"
          data-layout="cx-sign-in-form"
        >
          <h2 className="text-xl font-semibold text-[var(--text-heading)]">Sign in</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            First-time invited users set their password with <strong>Sign up</strong>, then return
            here.
          </p>
          {hintText ? (
            <div
              role="status"
              data-testid="login-hint"
              className="mt-4 rounded-[var(--radius-md)] border border-sky-200 bg-sky-50 px-4 py-3 text-left text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100"
            >
              {hintText}
            </div>
          ) : null}
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
                href={signInHref}
                data-testid="login-continue-password"
                className="inline-flex items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--accent-primary-hover)]"
              >
                Sign in
              </a>
              <a
                href={signUpHref}
                data-testid="login-signup"
                className={
                  highlightSignUp
                    ? "inline-flex items-center justify-center rounded-[var(--radius-md)] border-2 border-[var(--accent-primary)] bg-[var(--surface-raised)] px-4 py-2.5 text-sm font-semibold text-[var(--text-heading)] hover:bg-[var(--surface-muted)]"
                    : "inline-flex items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-4 py-2.5 text-sm font-medium text-[var(--text-heading)] hover:bg-[var(--surface-muted)]"
                }
              >
                Sign up
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
            Need access? Ask a workspace administrator to Add user. After Sign up, Sign in with
            email, password, and the code shown in Okta Verify.
          </p>
        </div>
      </main>
    </div>
  );
}
