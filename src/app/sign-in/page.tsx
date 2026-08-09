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
import { TopologyField } from "@/components/atlas";

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
  check_email:
    "Check your email for Okta's password setup link. Finish that step first — signing in before activation fails on Okta (Authentication failed / E0000004). Then return here and Sign in.",
  set_password_done:
    "Your Okta password is set. Sign in with that password and your Okta Verify code.",
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
    hint === "set_password" ||
    hint === "check_email" ||
    errorCode === "set_password" ||
    errorCode === "auth_failed";

  // Clear sticky Auth0/Okta broker session, then Okta Workforce email/password + Verify.
  const signInHref = freshLoginStartHref("login", returnTo);
  const signUpHref = returnTo
    ? `/sign-up?returnTo=${encodeURIComponent(returnTo)}`
    : "/sign-up";

  return (
    <div className="cx-split-auth atlas-trust-orbit" data-layout="cx-split-auth">
      <aside
        className="relative flex flex-col justify-between overflow-hidden px-8 py-12 text-[var(--atlas-text)]"
        data-layout="cx-sign-in-brand"
      >
        <TopologyField className="atlas-trust-orbit__field pointer-events-none absolute inset-0 opacity-80" />
        <div className="relative z-[1] flex flex-1 flex-col justify-between">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/cyware_logo.png"
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 object-contain"
            />
            <p className="atlas-micro-label mt-6 text-[var(--atlas-signal)]">
              CYWARE | Documentation
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">Sign in</h1>
            <p className="mt-3 max-w-sm text-sm leading-6 text-[var(--atlas-text-secondary)]">
              Auth0 brokers session continuity for this workspace. Okta owns your password and
              Verify — complete both steps after you continue.
            </p>
            <p className="mt-4 max-w-sm text-sm leading-6 text-[var(--atlas-text-muted)]">
              This docs workspace is invite-only. Administrators must add your email before you
              can sign in or set a password.
            </p>
          </div>
          <p className="atlas-micro-label relative z-[1] text-[var(--atlas-text-muted)]">
            {setup.deployment.productId
              ? `Product context: ${setup.deployment.productId}`
              : "Enterprise documentation workspace"}
          </p>
        </div>
      </aside>

      <main className="sf-atmosphere relative flex items-center justify-center px-4 py-12">
        <div
          className="sf-access-panel atlas-trust-orbit__panel w-full max-w-md"
          data-layout="cx-sign-in-form"
        >
          <p className="atlas-micro-label text-[var(--atlas-signal)]">Trust orbit</p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[var(--atlas-text)]">
            Sign in
          </h2>
          <p className="mt-2 text-sm text-[var(--atlas-text-secondary)]">
            First-time invited users set their password with <strong>Sign up</strong>, then return
            here.
          </p>
          {hintText ? (
            <div
              role="status"
              data-testid="login-hint"
              className="mt-4 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--atlas-violet)_40%,transparent)] bg-[color-mix(in_srgb,var(--atlas-violet)_10%,transparent)] px-4 py-3 text-left text-sm text-[var(--atlas-text)]"
            >
              {hintText}
            </div>
          ) : null}
          {errorText ? (
            <div
              role="alert"
              data-testid="login-error"
              className="mt-4 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--atlas-danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--atlas-danger)_10%,transparent)] px-4 py-3 text-left text-sm text-[var(--atlas-danger)]"
            >
              {errorText}
            </div>
          ) : null}
          {authReady && db.configured && !db.connected ? (
            <div
              role="status"
              data-testid="database-warning"
              className="mt-4 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--atlas-amber)_40%,transparent)] bg-[color-mix(in_srgb,var(--atlas-amber)_12%,transparent)] px-4 py-3 text-left text-sm text-[var(--atlas-amber)]"
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
              className="mt-4 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--atlas-amber)_40%,transparent)] bg-[color-mix(in_srgb,var(--atlas-amber)_12%,transparent)] px-4 py-3 text-left text-sm text-[var(--atlas-amber)]"
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
            <div className="mt-6 flex flex-col gap-2.5">
              <a
                href={signInHref}
                data-testid="login-continue-password"
                className="atlas-btn-primary inline-flex items-center justify-center rounded-[var(--radius-sm)] px-4 py-2.5 text-sm font-semibold"
              >
                Sign in
              </a>
              <a
                href={signUpHref}
                data-testid="login-signup"
                className={
                  highlightSignUp
                    ? "atlas-btn-ghost inline-flex items-center justify-center rounded-[var(--radius-sm)] border-2 border-[var(--atlas-signal)] px-4 py-2.5 text-sm font-semibold text-[var(--atlas-text)]"
                    : "atlas-btn-ghost inline-flex items-center justify-center rounded-[var(--radius-sm)] px-4 py-2.5 text-sm font-medium"
                }
              >
                Sign up
              </a>
            </div>
          ) : (
            <p className="mt-6 text-left text-xs text-[var(--atlas-text-muted)]">
              Sign-in options appear after an administrator finishes authentication setup for this
              site.
            </p>
          )}
          <p
            className="mt-6 text-xs leading-relaxed text-[var(--atlas-text-muted)]"
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
