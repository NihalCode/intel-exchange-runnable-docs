"use client";

const STATUS_STYLES: Record<string, string> = {
  active: "atlas-threat-badge--signal border-[color-mix(in_srgb,var(--atlas-signal)_45%,transparent)] text-[var(--atlas-signal)]",
  healthy: "atlas-threat-badge--signal border-[color-mix(in_srgb,var(--atlas-signal)_45%,transparent)] text-[var(--atlas-signal)]",
  success: "atlas-threat-badge--signal border-[color-mix(in_srgb,var(--atlas-signal)_45%,transparent)] text-[var(--atlas-signal)]",
  synced: "atlas-threat-badge--signal border-[color-mix(in_srgb,var(--atlas-signal)_45%,transparent)] text-[var(--atlas-signal)]",
  connected: "atlas-threat-badge--signal border-[color-mix(in_srgb,var(--atlas-signal)_45%,transparent)] text-[var(--atlas-signal)]",
  pending: "atlas-threat-badge--amber border-[color-mix(in_srgb,var(--atlas-amber)_45%,transparent)] text-[var(--atlas-amber)]",
  scheduled: "atlas-threat-badge--amber border-[color-mix(in_srgb,var(--atlas-amber)_45%,transparent)] text-[var(--atlas-amber)]",
  degraded: "atlas-threat-badge--amber border-[color-mix(in_srgb,var(--atlas-amber)_45%,transparent)] text-[var(--atlas-amber)]",
  draft: "atlas-threat-badge--muted border-[var(--atlas-line)] text-[var(--atlas-text-muted)]",
  disabled: "atlas-threat-badge--muted border-[var(--atlas-line)] text-[var(--atlas-text-muted)]",
  rejected: "atlas-threat-badge--danger border-[color-mix(in_srgb,var(--atlas-danger)_45%,transparent)] text-[var(--atlas-danger)]",
  error: "atlas-threat-badge--danger border-[color-mix(in_srgb,var(--atlas-danger)_45%,transparent)] text-[var(--atlas-danger)]",
  down: "atlas-threat-badge--danger border-[color-mix(in_srgb,var(--atlas-danger)_45%,transparent)] text-[var(--atlas-danger)]",
  revoked: "atlas-threat-badge--danger border-[color-mix(in_srgb,var(--atlas-danger)_45%,transparent)] text-[var(--atlas-danger)]",
  failed: "atlas-threat-badge--danger border-[color-mix(in_srgb,var(--atlas-danger)_45%,transparent)] text-[var(--atlas-danger)]",
};

export function normalizeStatusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

export function statusBadgeClass(status: string): string {
  const key = status.toLowerCase();
  return (
    STATUS_STYLES[key] ??
    "atlas-threat-badge--violet border-[color-mix(in_srgb,var(--atlas-violet)_45%,transparent)] text-[var(--atlas-violet)]"
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`atlas-threat-badge inline-flex rounded-[var(--radius-sm)] px-1.5 py-0.5 capitalize ${statusBadgeClass(status)}`}
    >
      {normalizeStatusLabel(status)}
    </span>
  );
}
