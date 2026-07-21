"use client";

import { buttonPrimaryClass, cardClass } from "@/components/admin/ui/tokens";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/admin/ui/EmptyState";

/** Consistent loading / empty / error / permission surfaces for docs + admin. */
export function PermissionDeniedState({
  title = "Access denied",
  description = "You do not have permission to view this page.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div
      className={`${cardClass} border-amber-300 bg-[var(--warning-soft)] dark:border-amber-900`}
      role="alert"
      data-testid="permission-denied"
    >
      <h3 className="font-semibold text-amber-950 dark:text-amber-100">{title}</h3>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">{description}</p>
    </div>
  );
}

export function PageLoadingState({ rows = 4 }: { rows?: number }) {
  return <LoadingSkeleton rows={rows} />;
}

export function PageEmptyState({
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
    <EmptyState
      title={title}
      description={description}
      actionLabel={actionLabel}
      onAction={onAction}
    />
  );
}

export function PageErrorState({
  title,
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return <ErrorState title={title} description={description} onRetry={onRetry} />;
}

export function RetryButton({ onClick, label = "Retry" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className={buttonPrimaryClass} onClick={onClick}>
      {label}
    </button>
  );
}
