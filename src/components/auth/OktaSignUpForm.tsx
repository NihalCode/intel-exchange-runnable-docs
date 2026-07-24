"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * First-time Sign up: invited email → Okta password-setup email.
 * Does not collect or verify passwords in this app.
 */
export function OktaSignUpForm({ returnTo }: { returnTo?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/okta-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = (await response.json()) as {
        error?: string;
        hint?: string;
        next?: string;
        message?: string;
      };
      if (!response.ok) {
        setError(data.error ?? "Could not start password setup.");
        return;
      }
      const next =
        data.next ||
        `/sign-in?hint=check_email${
          returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ""
        }`;
      router.replace(next);
    } catch {
      setError("Network unavailable. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4" data-testid="okta-signup-form">
      <label className="block text-sm text-[var(--text-heading)]">
        <span className="font-medium">Email</span>
        <input
          type="email"
          name="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
          className="mt-1.5 w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2.5 text-sm text-[var(--text-heading)]"
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        data-testid="okta-signup-submit"
        className="inline-flex w-full items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--accent-primary-hover)] disabled:opacity-60"
      >
        {busy ? "Sending…" : "Set password"}
      </button>
    </form>
  );
}
