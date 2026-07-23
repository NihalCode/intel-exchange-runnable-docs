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
import { isOktaOnlySignIn } from "@/lib/okta/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ERROR_COPY: Record<string, string> = {
  invalid_state:
    "Sign-in could not be verified. Click Sign in below and complete login in this same tab.",
  auth_failed: "Sign-in could not be completed. Try Sign in again, or Sign up first if you have not set a password.",
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
    "You need to set a password first. Use Sign up, then return here to Sign in.",
};

const HINT_COPY: Record<string, string> = {
  set_password:
    "You need to set a password first. Use Sign up, then return here to Sign in.",
  set_password_done:
    "Password setup email sent (or completed). Sign in with your new password, then enter your Okta Verify code.",
};

/**
 * Auth0 SDK route — must not be a Next.js page or OAuth never starts.
 * Okta-only UX: always pass connection= so Universal Login does not show Google/DB.
 */
function auth0LoginUrl(
  connection?: string,
  returnTo?: string,
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

  const oktaOnly = isOktaOnlySignIn();
  const oktaConnection = process.env.AUTH0_OKTA_CONNECTION?.trim();
  const googleConnection =
    process.env.AUTH0_GOOGLE_CONNECTION?.trim() || "google-oauth2";
  const emailConnection =
    process.env.AUTH0_EMAIL_CONNECTION?.trim() ||
    process.env.AUTH0_DATABASE_CONNECTION?.trim() ||
    undefined;
  // prompt=login only on errors — avoids Sign in ↔ IdP loops on every visit
  const forceLogin = Boolean(errorText);

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
          <h2 className="text-xl font-semibold text-[var(--text-heading)]">Welcome</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {oktaOnly
              ? "Invite-only. First time? Sign up to set your password. Returning? Sign in (password, then Okta Verify)."
              : "Sign in with Google or your invited company email."}
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
              {oktaOnly && oktaConnection ? (
                <>
                  <a
                    href={auth0LoginUrl(oktaConnection, returnTo, forceLogin)}
                    data-testid="login-continue-okta"
                    className="inline-flex items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--accent-primary-hover)]"
                  >
                    Sign in
                  </a>
                  <a
                    href="/sign-up"
                    data-testid="login-signup"
                    className={
                      highlightSignUp
                        ? "inline-flex items-center justify-center rounded-[var(--radius-md)] border-2 border-[var(--accent-primary)] bg-[var(--surface-raised)] px-4 py-2.5 text-sm font-semibold text-[var(--text-heading)] hover:bg-[var(--surface-muted)]"
                        : "inline-flex items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-4 py-2.5 text-sm font-medium text-[var(--text-heading)] hover:bg-[var(--surface-muted)]"
                    }
                  >
                    Sign up
                  </a>
                </>
              ) : (
                <>
                  {oktaConnection ? (
                    <a
                      href={auth0LoginUrl(oktaConnection, returnTo, forceLogin)}
                      data-testid="login-continue-okta"
                      className="inline-flex items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--accent-primary-hover)]"
                    >
                      Continue with Okta
                    </a>
                  ) : null}
                  <a
                    href={auth0LoginUrl(googleConnection, returnTo, forceLogin)}
                    data-testid="login-continue-google"
                    className={
                      oktaConnection
                        ? "inline-flex items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-4 py-2.5 text-sm font-medium text-[var(--text-heading)] hover:bg-[var(--surface-muted)]"
                        : "inline-flex items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--accent-primary-hover)]"
                    }
                  >
                    Continue with Google
                  </a>
                  <a
                    href={auth0LoginUrl(emailConnection, returnTo, forceLogin)}
                    data-testid="login-continue-email"
                    className="inline-flex items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-4 py-2.5 text-sm font-medium text-[var(--text-heading)] hover:bg-[var(--surface-muted)]"
                  >
                    Continue with company email
                  </a>
                </>
              )}
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
            {oktaOnly
              ? "Need access? Ask a workspace administrator to Add user. First visit: Sign up to set your password, then Sign in."
              : "Need access? Ask a documentation workspace administrator for an invite. Public sign-up is disabled — invited users set a password from the invite email (company email path)."}
          </p>
        </div>
      </main>
    </div>
  );
}
