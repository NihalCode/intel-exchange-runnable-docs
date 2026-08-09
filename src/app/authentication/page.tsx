import type { Metadata } from "next";

import { CredentialManager } from "@/components/authentication/CredentialManager";

export const metadata: Metadata = {
  title: "Credentials — Cyware API Documentation",
  description: "Connect your per-user Cyware product credentials securely.",
};

export default function AuthenticationPage() {
  return (
    <div className="mx-auto max-w-6xl" data-testid="atlas-page-orient">
      <div className="mb-8 max-w-3xl">
        <p className="atlas-micro-label">Account · Credentials</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text-heading)]">
          Credentials
        </h1>
        <p className="mt-1 text-xs text-[var(--text-muted)]">Product Open API connections</p>
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
          Connect at least one Cyware product to use Ask AI live actions. Choose a product from
          the dropdown, then add your tenant URL and Open API credentials.
        </p>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Credentials are validated server-side but never stored. After a successful connect,
          they live in this browser tab&apos;s memory only for runnable API snippets and expire
          when you close the tab. Obtain an Access ID and Secret Key from Open API settings in
          your product tenant.
        </p>
      </div>
      <CredentialManager />
    </div>
  );
}
