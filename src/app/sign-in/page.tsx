const ERROR_COPY: Record<string, string> = {
  invalid_state:
    "Sign-in could not be verified. Click a sign-in option below and complete login in this same tab.",
  auth_failed: "Sign-in could not be completed. Choose a sign-in option below to try again.",
  auth_denied: "Sign-in was cancelled or denied.",
  auth_config:
    "Sign-in is misconfigured on the server. Ask an administrator to verify Auth0 settings for this site.",
  invite_required:
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
  const errorText =
    customMessage ||
    (errorCode ? (ERROR_COPY[errorCode] ?? ERROR_COPY.auth_failed) : null);

  const googleConnection = process.env.AUTH0_GOOGLE_CONNECTION?.trim();
  const emailConnection = process.env.AUTH0_EMAIL_CONNECTION?.trim();

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 flex flex-col items-center justify-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/cyware_logo.png"
            alt="Cyware"
            width={48}
            height={48}
            className="h-12 w-12 object-contain"
          />
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Cyware API Docs
          </span>
        </div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Sign in
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
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
