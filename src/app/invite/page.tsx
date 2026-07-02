import { Suspense } from "react";
import InvitePageClient from "./InvitePageClient";

export default function InvitePage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center">Loading…</main>}>
      <InvitePageClient />
    </Suspense>
  );
}
