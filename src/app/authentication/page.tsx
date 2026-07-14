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
          Connect at least one Cyware product to use the Documentation Agent. Choose a product
          from the dropdown, then add your tenant URL and Open API credentials.
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          Credentials are validated server-side and encrypted at rest; the secret key is never
          returned to this browser. Obtain an Access ID and Secret Key from Open API settings in
          your product tenant.
        </p>
      </div>
      <CredentialManager />
    </div>
  );
}
