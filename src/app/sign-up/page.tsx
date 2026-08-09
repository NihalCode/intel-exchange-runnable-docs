import Link from "next/link";

import { TopologyField } from "@/components/atlas";
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
    <div className="cx-split-auth atlas-trust-orbit" data-layout="cx-split-auth">
      <aside
        className="relative flex flex-col justify-between overflow-hidden px-8 py-12 text-[var(--atlas-text)]"
        data-layout="cx-sign-up-brand"
      >
        <TopologyField className="atlas-trust-orbit__field pointer-events-none absolute inset-0 opacity-75" />
        <div className="relative z-[1]">
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
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">Set up your account</h1>
          <p className="mt-3 max-w-sm text-sm leading-6 text-[var(--atlas-text-secondary)]">
            Use the email your administrator added. Create your password, then return to Sign in.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-[var(--atlas-text-muted)]">
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--atlas-signal)]" aria-hidden="true" />
              Email-only setup request
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--atlas-violet)]" aria-hidden="true" />
              Okta sends the password setup email
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--atlas-amber)]" aria-hidden="true" />
              No automatic app session is created
            </li>
          </ul>
        </div>
      </aside>

      <main className="relative flex items-center justify-center bg-[var(--atlas-deep)] px-4 py-12">
        <div
          className="sf-access-panel atlas-trust-orbit__panel w-full max-w-md"
          data-layout="cx-sign-up-form"
        >
          <p className="atlas-micro-label text-[var(--atlas-signal)]">Trust orbit</p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[var(--atlas-text)]">
            Set up your account
          </h2>
          <p className="mt-2 text-sm text-[var(--atlas-text-secondary)]">
            First-time invited users set their password here. You will get an email from Okta to
            create it.
          </p>
          <OktaSignUpForm returnTo={returnTo} />
          <p className="mt-6 text-sm text-[var(--atlas-text-secondary)]">
            <Link
              href={signInHref}
              data-testid="signup-back-to-sign-in"
              className="font-medium text-[var(--atlas-signal)] hover:underline"
            >
              Back to Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
