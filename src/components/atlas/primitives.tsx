"use client";

import type { ReactNode } from "react";

export function EtchedDivider({ className = "" }: { className?: string }) {
  return (
    <div
      className={`atlas-etched-divider ${className}`}
      role="separator"
      aria-hidden="true"
    />
  );
}

export function LiveStatus({
  label = "Live",
  tone = "signal",
}: {
  label?: string;
  tone?: "signal" | "amber" | "muted" | "danger";
}) {
  return (
    <span className={`atlas-live-status atlas-live-status--${tone}`} data-testid="atlas-live-status">
      <span className="atlas-live-status__pulse" aria-hidden="true" />
      <span className="atlas-live-status__label">{label}</span>
    </span>
  );
}

export function TelemetryValue({
  label,
  value,
  unit,
}: {
  label: string;
  value: string | number;
  unit?: string;
}) {
  return (
    <div className="atlas-telemetry">
      <span className="atlas-micro-label">{label}</span>
      <span className="atlas-telemetry__value">
        {value}
        {unit ? <span className="atlas-telemetry__unit">{unit}</span> : null}
      </span>
    </div>
  );
}

export function SignalLoader({ label = "Acquiring signals…" }: { label?: string }) {
  return (
    <div className="atlas-signal-loader" role="status" aria-live="polite" data-testid="atlas-signal-loader">
      <div className="atlas-signal-loader__trace" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p className="atlas-micro-label">{label}</p>
    </div>
  );
}

export function AtlasEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="atlas-empty" data-testid="atlas-empty-state">
      <p className="atlas-micro-label">No signal</p>
      <h3 className="atlas-empty__title">{title}</h3>
      {description ? <p className="atlas-empty__desc">{description}</p> : null}
      {action ? <div className="atlas-empty__action">{action}</div> : null}
    </div>
  );
}

export function AtlasErrorState({
  title,
  description,
  detail,
  action,
}: {
  title: string;
  description?: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="atlas-error" role="alert" data-testid="atlas-error-state">
      <p className="atlas-micro-label atlas-micro-label--danger">Fault</p>
      <h3 className="atlas-error__title">{title}</h3>
      {description ? <p className="atlas-error__desc">{description}</p> : null}
      {detail ? <pre className="atlas-error__detail">{detail}</pre> : null}
      {action ? <div className="atlas-error__action">{action}</div> : null}
    </div>
  );
}

export function ThreatBadge({
  children,
  tone = "signal",
}: {
  children: ReactNode;
  tone?: "signal" | "amber" | "violet" | "danger" | "muted";
}) {
  return <span className={`atlas-threat-badge atlas-threat-badge--${tone}`}>{children}</span>;
}
