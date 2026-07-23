"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

function SignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefill = searchParams.get("email")?.trim() ?? "";
  const [email, setEmail] = useState(prefill);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setHint(null);
    setStatus(null);
    try {
      const response = await fetch("/api/auth/okta-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json()) as {
        error?: string;
        hint?: string;
        message?: string;
        next?: string;
      };
      if (!response.ok) {
        setError(data.error ?? "Could not start password setup.");
        setHint(data.hint ?? null);
        return;
      }
      setStatus(data.message ?? "Check your email to set your password.");
      const next = data.next ?? "/sign-in?hint=set_password_done";
      window.setTimeout(() => {
        router.push(next);
      }, 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start password setup.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4" data-testid="okta-signup-form">
      <label className="block text-sm text-[var(--text-heading)]">
        <span className="font-medium">Invited email</span>
        <input
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm"
          data-testid="okta-signup-email"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        data-testid="okta-signup-submit"
        className="inline-flex w-full items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--accent-primary-hover)] disabled:opacity-50"
      >
        {busy ? "Sending…" : "Send password setup email"}
      </button>
      {status ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-300" role="status">
          {status}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-700 dark:text-red-300" role="alert">
          {error}
        </p>
      ) : null}
      {hint ? <p className="text-xs text-[var(--text-muted)]">{hint}</p> : null}
    </form>
  );
}

export default function SignUpPage() {
  return (
    <div className="cx-split-auth" data-layout="cx-split-auth">
      <aside
        className="flex flex-col justify-between bg-[var(--brand-navy-deep)] px-8 py-12 text-white"
        data-layout="cx-sign-in-brand"
      >
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/cyware_logo.png"
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 object-contain"
          />
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.12em] text-white/70">
            CYWARE | Documentation
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Sign up</h1>
          <p className="mt-3 max-w-sm text-sm leading-6 text-white/75">
            First time only. Set your password with the invited email, then return to Sign in.
          </p>
        </div>
      </aside>

      <main className="flex items-center justify-center bg-[var(--background-page)] px-4 py-12">
        <div className="w-full max-w-md" data-layout="cx-sign-up-form">
          <h2 className="text-xl font-semibold text-[var(--text-heading)]">Set your password</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Use the email your administrator invited. We will send an Okta link to create your
            password. After that, use <strong>Sign in</strong> (password, then Okta Verify).
          </p>
          <Suspense fallback={<p className="mt-6 text-sm text-[var(--text-muted)]">Loading…</p>}>
            <SignUpForm />
          </Suspense>
          <p className="mt-6 text-sm text-[var(--text-secondary)]">
            Already set a password?{" "}
            <a
              href="/sign-in"
              className="font-medium text-[var(--accent-primary)] underline-offset-2 hover:underline"
              data-testid="signup-to-signin"
            >
              Sign in
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
