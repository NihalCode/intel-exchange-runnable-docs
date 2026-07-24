import Link from "next/link";

import { OktaSignUpForm } from "@/components/auth/OktaSignUpForm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * First-time setup for invited users: request Okta password-setup email.
 * After password is set in Okta, user returns to Sign in (no auto session).
 */
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const params = await searchParams;
  const returnTo = params.returnTo?.trim();
  const signInHref = returnTo
    ? `/sign-in?returnTo=${encodeURIComponent(returnTo)}`
    : "/sign-in";

  return (
    <div className="cx-split-auth" data-layout="cx-split-auth">
      <aside
        className="flex flex-col justify-between bg-[var(--brand-navy-deep)] px-8 py-12 text-white"
        data-layout="cx-sign-up-brand"
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
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Set up your account</h1>
          <p className="mt-3 max-w-sm text-sm leading-6 text-white/75">
            Use the email your administrator added. Create your password, then return to Sign in.
          </p>
        </div>
      </aside>

      <main className="flex items-center justify-center bg-[var(--background-page)] px-4 py-12">
        <div className="w-full max-w-md" data-layout="cx-sign-up-form">
          <h2 className="text-xl font-semibold text-[var(--text-heading)]">Set up your account</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            First-time invited users set their password here. You will get an email from Okta to
            create it.
          </p>
          <OktaSignUpForm returnTo={returnTo} />
          <p className="mt-6 text-sm text-[var(--text-secondary)]">
            <Link
              href={signInHref}
              data-testid="signup-back-to-sign-in"
              className="font-medium text-[var(--accent-primary)] hover:underline"
            >
              Back to Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
