import { buttonPrimaryClass } from "@/components/admin/ui/tokens";
import {
  accessBackToSignInHref,
  accessBrowseHomeAfterLogoutHref,
} from "@/lib/documentation-auth/access-sign-in";

export function AccessPage({
  title,
  description,
  children,
  testId,
  signInError = "auth_denied",
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
  testId?: string;
  /** Maps to `/sign-in?error=` so the interstitial shows (no silent SSO bounce). */
  signInError?: string;
}) {
  const signInHref = accessBackToSignInHref(signInError);
  const browseHomeHref = accessBrowseHomeAfterLogoutHref();

  return (
    <main
      data-testid={testId}
      className="flex min-h-screen items-center justify-center bg-[var(--background-page)] px-4 py-12"
    >
      <div className="cx-card w-full max-w-md p-8">
        <div className="mb-3 flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/cyware_logo.png"
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 object-contain"
          />
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            Cyware API Docs
          </span>
        </div>
        <h1 className="text-xl font-semibold text-[var(--text-heading)]">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
          {description}
        </p>
        {children}
        <div className="mt-8 flex flex-col gap-2">
          {/* Hard <a> (not next/link): soft client nav fails after Auth0 redirects. */}
          <a
            href={signInHref}
            data-testid="access-back-to-sign-in"
            className={buttonPrimaryClass}
          >
            Back to sign in
          </a>
          <a
            href={browseHomeHref}
            data-testid="access-browse-home"
            className="inline-flex items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-4 py-2.5 text-sm font-medium text-[var(--text-heading)] hover:bg-[var(--surface-muted)]"
          >
            Browse documentation home
          </a>
        </div>
      </div>
    </main>
  );
}
