"use client";

import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";

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
  queryText,
  enabled,
}: {
  messageId: string;
  conversationId?: string | null;
  turnId?: string | null;
  logicalQueryId?: string | null;
  productId?: string | null;
  /** Original user question — sent on thumbs-down for sensitive capture. */
  queryText?: string | null;
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
        queryText:
          next === "down" && queryText?.trim()
            ? queryText.trim().slice(0, 8000)
            : undefined,
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
      <span className="atlas-micro-label">Helpful?</span>
      <button
        type="button"
        disabled={busy}
        aria-label="Thumbs up"
        aria-pressed={rating === "up"}
        onClick={() => void submit("up")}
        className={`atlas-icon-btn h-7 w-7 ${
          rating === "up"
            ? "border-[color-mix(in_srgb,var(--success)_35%,transparent)] bg-[var(--success-soft)] text-[var(--success)]"
            : ""
        }`}
      >
        <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        disabled={busy}
        aria-label="Thumbs down"
        aria-pressed={rating === "down"}
        onClick={() => void submit("down")}
        className={`atlas-icon-btn h-7 w-7 ${
          rating === "down"
            ? "border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[var(--danger-soft)] text-[var(--danger)]"
            : ""
        }`}
      >
        <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {error ? <span className="font-mono text-[10px] text-[var(--danger)]">{error}</span> : null}
    </div>
  );
}
