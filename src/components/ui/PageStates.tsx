"use client";

import { buttonPrimaryClass } from "@/components/admin/ui/tokens";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/admin/ui/EmptyState";
import { SignalAcquireLoader } from "@/components/fabric/SignalStates";

/** Consistent loading / empty / error / permission surfaces for docs + admin. */
export function PermissionDeniedState({
  title = "Access denied",
  description = "You do not have permission to view this page.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="atlas-error" role="alert" data-testid="permission-denied">
      <p className="atlas-micro-label">Clearance</p>
      <h3 className="atlas-error__title">{title}</h3>
      <p className="atlas-error__desc">{description}</p>
    </div>
  );
}

export function PageLoadingState({ rows = 4 }: { rows?: number }) {
  if (rows <= 1) {
    return <SignalAcquireLoader />;
  }
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
