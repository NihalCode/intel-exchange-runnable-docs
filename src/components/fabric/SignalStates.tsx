"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { SignalButton } from "@/components/fabric/SignalButton";

export function SignalSkeleton({
  className = "h-4 w-full",
}: {
  className?: string;
}) {
  return (
    <div
      className={`sf-skeleton rounded-[var(--radius-sm)] ${className}`}
      aria-hidden="true"
      data-atlas="skeleton"
    />
  );
}

/** Full-surface acquiring loader (prefer over bare bars when blocking a region). */
export function SignalAcquireLoader({ label = "Acquiring signals…" }: { label?: string }) {
  return (
    <div className="atlas-signal-loader" role="status" aria-live="polite" data-testid="signal-acquire-loader">
      <div className="atlas-signal-loader__trace" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p className="atlas-micro-label">{label}</p>
    </div>
  );
}

export function SignalEmptyState({
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
    <div className="atlas-empty" data-testid="signal-empty-state">
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

export function SignalErrorState({
  title = "Something went wrong",
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="atlas-error" role="alert" data-testid="signal-error-state">
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

export function SignalPermissionState({
  title = "Access restricted",
  description = "You do not have permission to view this area.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="atlas-error" role="status" data-testid="signal-permission-state">
      <p className="atlas-micro-label">Clearance</p>
      <h3 className="atlas-error__title">{title}</h3>
      <p className="atlas-error__desc">{description}</p>
    </div>
  );
}

export function SignalSectionHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        {eyebrow ? <p className="atlas-micro-label">{eyebrow}</p> : null}
        <h2 className="atlas-section__title">{title}</h2>
        {description ? <p className="atlas-section__lede">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function SignalFilterBar({
  children,
  className = "",
  ...rest
}: {
  children: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`sf-filter-bar ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function SignalActionDock({
  children,
  className = "",
  ...rest
}: {
  children: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`sf-action-dock ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function SignalCodeSurface({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`sf-code-surface ${className}`}>{children}</div>;
}

export function SignalDetailPanel({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-resting)] ${className}`}
    >
      {title ? (
        <h3 className="mb-3 text-sm font-semibold text-[var(--text-heading)]">{title}</h3>
      ) : null}
      {children}
    </section>
  );
}

export function SignalMetric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="sf-signal-metric" data-testid="signal-metric">
      <p className="atlas-micro-label">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--text-heading)]">{value}</p>
      {hint ? <p className="mt-1 text-xs text-[var(--text-muted)]">{hint}</p> : null}
    </div>
  );
}
