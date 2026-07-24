"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { cardClass } from "@/components/admin/ui/tokens";
import { SignalButton } from "@/components/fabric/SignalButton";

export function SignalSkeleton({
  className = "h-4 w-full",
}: {
  className?: string;
}) {
  return <div className={`sf-skeleton ${className}`} aria-hidden="true" />;
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
    <div
      className={`${cardClass} flex flex-col items-center py-12 text-center`}
      data-testid="signal-empty-state"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-muted)]">
        <svg
          className="h-6 w-6 text-[var(--text-muted)]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
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
    <div
      className={`${cardClass} border-red-300 bg-[var(--danger-soft)] dark:border-red-900`}
      role="alert"
      data-testid="signal-error-state"
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

export function SignalPermissionState({
  title = "Access restricted",
  description = "You do not have permission to view this area.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div
      className={`${cardClass} border-[var(--border-default)]`}
      role="status"
      data-testid="signal-permission-state"
    >
      <h3 className="font-semibold text-[var(--text-heading)]">{title}</h3>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">{description}</p>
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
        {eyebrow ? (
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--accent-primary)]">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="text-xl font-semibold tracking-tight text-[var(--text-heading)] sm:text-2xl">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">{description}</p>
        ) : null}
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
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--text-heading)]">{value}</p>
      {hint ? <p className="mt-1 text-xs text-[var(--text-muted)]">{hint}</p> : null}
    </div>
  );
}
