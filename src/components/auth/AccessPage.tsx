import {
  buttonPrimaryClass,
  buttonSecondaryClass,
} from "@/components/admin/ui/tokens";
import { TopologyField } from "@/components/atlas";
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
    <main data-testid={testId} className="sf-access-plane atlas-trust-orbit">
      <TopologyField className="atlas-trust-orbit__field" />
      <div className="sf-access-panel atlas-trust-orbit__panel relative z-[1]">
        <div className="mb-3 flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/cyware_logo.png"
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 object-contain"
          />
          <span className="atlas-micro-label !inline text-[var(--atlas-signal)]">
            Living Signal Atlas
          </span>
        </div>
        <p className="atlas-micro-label">Access</p>
        <h1 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[var(--atlas-text)]">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--atlas-text-secondary)]">
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
            className={buttonSecondaryClass}
          >
            Browse documentation home
          </a>
        </div>
      </div>
    </main>
  );
}
