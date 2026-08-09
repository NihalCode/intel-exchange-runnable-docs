import type { Metadata } from "next";
import { DeveloperConsole } from "@/components/DeveloperConsole";

export const metadata: Metadata = {
  title: "API Explorer — Cyware API Docs",
  description:
    "Developer workflows: Postman import, diagnostics, and credential requirements.",
  robots: { index: false, follow: false },
};

export default function DeveloperPage() {
  return (
    <div className="mx-auto max-w-4xl" data-testid="atlas-page-orient">
      <p className="atlas-micro-label">Work · API Explorer</p>
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-[var(--text-heading)]">
        API Explorer
      </h1>
      <p className="mb-1 text-xs text-[var(--text-muted)]">Live Console · developer access</p>
      <p className="mb-6 text-sm text-[var(--text-secondary)]">
        Authorized developers only. Import Postman collections, run diagnostics, and manage
        server-side credentials. Documentation visitors never see this page or its secrets.
      </p>
      <DeveloperConsole />
    </div>
  );
}
