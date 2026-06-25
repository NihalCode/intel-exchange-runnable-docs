import type { Metadata } from "next";
import { DeveloperConsole } from "@/components/DeveloperConsole";

export const metadata: Metadata = {
  title: "Developer Console — Cyware API Docs",
  description:
    "Developer/admin workflows: Postman import, diagnostics, and credential requirements.",
  robots: { index: false, follow: false },
};

export default function DeveloperPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Developer Console</h1>
      <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        Authorized developers only. Import Postman collections, run diagnostics, and manage
        server-side credentials. Normal documentation clients never see this page or its credentials.
      </p>
      <DeveloperConsole />
    </div>
  );
}
