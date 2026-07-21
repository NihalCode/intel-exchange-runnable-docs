"use client";

import { useState } from "react";

import { withCsrfHeaders } from "@/lib/csrf-client";
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
      const headers = await withCsrfHeaders({ "Content-Type": "application/json" });
      const res = await fetch("/api/agent/feedback", {
        method: "POST",
        headers,
        body: JSON.stringify({
          messageId,
          rating: next,
          conversationId: conversationId ?? undefined,
          turnId: turnId ?? undefined,
          logicalQueryId: logicalQueryId ?? undefined,
          productId: productId ?? undefined,
          recaptchaToken,
          expectedVersion: feedbackId ? version : undefined,
        }),
      });
      if (!res.ok) throw new Error("save failed");
      const data = (await res.json()) as { id: string; version: number };
      setFeedbackId(data.id);
      setVersion(data.version);
    } catch {
      setRating(previous);
      setFeedbackId(previousId);
      setError("Could not save feedback");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2 border-t border-zinc-200 pt-2 dark:border-zinc-800">
      <span className="text-[10px] uppercase tracking-wide text-zinc-400">Helpful?</span>
      <button
        type="button"
        disabled={busy}
        aria-label="Thumbs up"
        aria-pressed={rating === "up"}
        onClick={() => void submit("up")}
        className={`rounded px-1.5 py-0.5 text-sm transition ${
          rating === "up"
            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
            : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
        }`}
      >
        👍
      </button>
      <button
        type="button"
        disabled={busy}
        aria-label="Thumbs down"
        aria-pressed={rating === "down"}
        onClick={() => void submit("down")}
        className={`rounded px-1.5 py-0.5 text-sm transition ${
          rating === "down"
            ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200"
            : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
        }`}
      >
        👎
      </button>
      {error ? <span className="text-[10px] text-rose-600">{error}</span> : null}
    </div>
  );
}
