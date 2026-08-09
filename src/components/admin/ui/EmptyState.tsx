"use client";

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
    <div
      className="atlas-empty flex flex-col items-start rounded-[var(--radius-sm)] py-10"
      data-testid="empty-state"
    >
      <p className="atlas-micro-label">No signal</p>
      <h3 className="atlas-empty__title">{title}</h3>
      {description ? <p className="atlas-empty__desc">{description}</p> : null}
      {actionLabel && onAction ? (
        <div className="atlas-empty__action">
          <SignalButton onClick={onAction}>{actionLabel}</SignalButton>
        </div>
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
    <div className="atlas-error rounded-[var(--radius-sm)]" role="alert" data-testid="error-state">
      <p className="atlas-micro-label atlas-micro-label--danger">Fault</p>
      <h3 className="atlas-error__title">{title}</h3>
      {description ? <p className="atlas-error__desc">{description}</p> : null}
      {onRetry ? (
        <div className="atlas-error__action">
          <SignalButton variant="secondary" onClick={onRetry}>
            Retry
          </SignalButton>
        </div>
      ) : null}
    </div>
  );
}

export function LoadingSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <SignalSkeleton key={i} className="h-9 w-full rounded-[var(--radius-sm)]" />
      ))}
    </div>
  );
}
