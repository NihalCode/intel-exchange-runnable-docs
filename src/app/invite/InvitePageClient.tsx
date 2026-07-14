"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function InvitePageClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const [state, setState] = useState<{
    loading: boolean;
    valid: boolean;
    email?: string;
    reason?: string;
  }>(() =>
    token
      ? { loading: true, valid: false }
      : { loading: false, valid: false, reason: "missing_token" }
  );

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const res = await fetch(`/api/invites/validate?token=${encodeURIComponent(token)}`);
        const data = (await res.json()) as {
          valid?: boolean;
          email?: string;
          reason?: string;
        };
        setState({
          loading: false,
          valid: Boolean(data.valid),
          email: data.email,
          reason: data.reason,
        });
      } catch {
        setState({ loading: false, valid: false, reason: "error" });
      }
    })();
  }, [token]);

  if (state.loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <p className="text-sm text-zinc-500">Validating invite…</p>
      </main>
    );
  }

  if (!state.valid) {
    const href =
      state.reason === "expired" ? "/access/invite-expired" : "/access/invite-required";
    return (
      <main
        data-testid="invite-invalid"
        className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950"
      >
        <div className="max-w-md rounded-xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="text-xl font-semibold">Invite not valid</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            This invite link is no longer valid. Ask an administrator for a new invite.
          </p>
          <Link href={href} className="mt-6 inline-block text-sm text-sky-700 underline dark:text-sky-400">
            Continue
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main
      data-testid="invite-valid"
      className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950"
    >
      <div className="max-w-md rounded-xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-xl font-semibold">You&apos;re invited</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          This invite was issued for{" "}
          <strong className="font-medium text-zinc-900 dark:text-zinc-100">{state.email}</strong>.
          Sign in with that email to access the documentation workspace.
        </p>
        <Link
          href={`/sign-in?returnTo=${encodeURIComponent("/")}`}
          data-testid="invite-continue-login"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Continue to sign in
        </Link>
      </div>
    </main>
  );
}
