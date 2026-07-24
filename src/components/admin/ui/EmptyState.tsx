"use client";

import { cardClass } from "@/components/admin/ui/tokens";
import { SignalButton, SignalSkeleton } from "@/components/fabric";

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className={`${cardClass} flex flex-col items-center py-12 text-center`} data-testid="empty-state">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-muted)]">
        <svg className="h-6 w-6 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h10" strokeLinecap="round" />
        </svg>
      </div>
      <h3 className="mt-4 text-base font-semibold text-[var(--text-heading)]">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-sm text-sm text-[var(--text-secondary)]">{description}</p>
      ) : null}
      {actionLabel && onAction ? (
        <SignalButton className="mt-4" onClick={onAction}>
          {actionLabel}
        </SignalButton>
      ) : null}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className={`${cardClass} border-red-300 bg-[var(--danger-soft)] dark:border-red-900`}
      role="alert"
      data-testid="error-state"
    >
      <h3 className="font-semibold text-red-800 dark:text-red-300">{title}</h3>
      {description ? (
        <p className="mt-2 text-sm text-[var(--text-secondary)]">{description}</p>
      ) : null}
      {onRetry ? (
        <SignalButton className="mt-4" variant="secondary" onClick={onRetry}>
          Retry
        </SignalButton>
      ) : null}
    </div>
  );
}

export function LoadingSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <SignalSkeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
