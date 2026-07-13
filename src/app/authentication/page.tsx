import type { Metadata } from "next";

import { CredentialManager } from "@/components/authentication/CredentialManager";

export const metadata: Metadata = {
  title: "Authentication — Cyware API Documentation",
  description: "Connect your per-user Cyware product credentials securely.",
};

export default function AuthenticationPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8 max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-600">Authentication</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Product connections</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Connect at least one Cyware product to use the Documentation Agent. Credentials are
          validated server-side and the secret key is encrypted at rest; it is never returned to
          this browser or stored in browser storage.
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          Obtain an Access ID and Secret Key from the Open API settings in your product tenant.
          Ask your product administrator if Open API access is not available.
        </p>
      </div>
      <CredentialManager />
    </div>
  );
}
