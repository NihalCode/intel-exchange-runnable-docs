"use client";

import { useState } from "react";

import {
  authenticatedFetch,
  SESSION_RECOVERY_FAILED_MESSAGE,
} from "@/lib/authenticated-fetch";
import {
  clearCsrfTokenCache,
  getCsrfToken,
  withCsrfHeaders,
} from "@/lib/csrf-client";
import { obtainRecaptchaToken } from "@/lib/recaptcha/client";

type Rating = "up" | "down";

export function AgentFeedbackControl({
  messageId,
  conversationId,
  turnId,
  logicalQueryId,
  productId,
  enabled,
}: {
  messageId: string;
  conversationId?: string | null;
  turnId?: string | null;
  logicalQueryId?: string | null;
  productId?: string | null;
  enabled?: boolean;
}) {
  const [rating, setRating] = useState<Rating | null>(null);
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const [version, setVersion] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!enabled) return null;

  async function submit(next: Rating) {
    const previous = rating;
    const previousId = feedbackId;
    setRating(next);
    setBusy(true);
    setError(null);
    try {
      const recaptchaToken = await obtainRecaptchaToken("feedback_submit");
      const body = JSON.stringify({
        messageId,
        rating: next,
        conversationId: conversationId ?? undefined,
        turnId: turnId ?? undefined,
        logicalQueryId: logicalQueryId ?? undefined,
        productId: productId ?? undefined,
        recaptchaToken,
        expectedVersion: feedbackId ? version : undefined,
      });
      const headers = await withCsrfHeaders({ "Content-Type": "application/json" });
      const res = await authenticatedFetch("/api/agent/feedback", {
        method: "POST",
        headers,
        body,
        credentials: "include",
        redirectOnFailure: false,
        treatBare401AsSessionExpired: true,
        prepareRetry: async (init) => {
          clearCsrfTokenCache();
          const token = await getCsrfToken(true);
          const retryHeaders: Record<string, string> = {
            "Content-Type": "application/json",
          };
          if (token) retryHeaders["X-CSRF-Token"] = token;
          return {
            ...init,
            headers: retryHeaders,
            body,
          };
        },
      });
      const data = (await res.json().catch(() => ({}))) as {
        id?: string;
        version?: number;
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        if (res.status === 401 || data.code === "SESSION_EXPIRED") {
          throw new Error(SESSION_RECOVERY_FAILED_MESSAGE);
        }
        throw new Error(data.error?.trim() || "Could not save feedback");
      }
      if (!data.id || data.version == null) {
        throw new Error("Could not save feedback");
      }
      setFeedbackId(data.id);
      setVersion(data.version);
    } catch (err) {
      setRating(previous);
      setFeedbackId(previousId);
      setError(
        err instanceof Error && err.message.trim()
          ? err.message
          : "Could not save feedback"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="flex items-center gap-2 border-t border-[var(--border-subtle)] pt-2.5"
      data-testid="agent-feedback"
    >
      <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
        Helpful?
      </span>
      <button
        type="button"
        disabled={busy}
        aria-label="Thumbs up"
        aria-pressed={rating === "up"}
        onClick={() => void submit("up")}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] transition ${
          rating === "up"
            ? "bg-[var(--success-soft)] text-[var(--success)] ring-1 ring-[color-mix(in_srgb,var(--success)_35%,transparent)]"
            : "text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
        }`}
      >
        <ThumbUpIcon />
      </button>
      <button
        type="button"
        disabled={busy}
        aria-label="Thumbs down"
        aria-pressed={rating === "down"}
        onClick={() => void submit("down")}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] transition ${
          rating === "down"
            ? "bg-[var(--danger-soft)] text-[var(--danger)] ring-1 ring-[color-mix(in_srgb,var(--danger)_35%,transparent)]"
            : "text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
        }`}
      >
        <ThumbDownIcon />
      </button>
      {error ? <span className="text-[10px] text-[var(--danger)]">{error}</span> : null}
    </div>
  );
}

function ThumbUpIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M2 10.5a1.5 1.5 0 013 0V19a1 1 0 01-1 1H4a2 2 0 01-2-2v-7.5zM22 11.5c0-.83-.67-1.5-1.5-1.5H15l.8-3.7A2 2 0 0013.88 4a2 2 0 00-1.67.9L9 10.5V20h9.36a2 2 0 001.96-1.6l1.5-7.4A1.5 1.5 0 0022 11.5z" />
    </svg>
  );
}

function ThumbDownIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M22 13.5a1.5 1.5 0 01-3 0V5a1 1 0 011-1h0a2 2 0 012 2v7.5zM2 12.5c0 .83.67 1.5 1.5 1.5H9l-.8 3.7A2 2 0 0010.12 20a2 2 0 001.67-.9L15 13.5V4H5.64a2 2 0 00-1.96 1.6L2.18 13A1.5 1.5 0 002 12.5z" />
    </svg>
  );
}
