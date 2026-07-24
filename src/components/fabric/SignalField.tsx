import type { ReactNode, SVGProps } from "react";

/** Decorative signal topology — pure visual, no data claims. */
export function SignalTopologyArt({
  className = "",
  accent = "var(--product-accent, var(--brand-blue))",
  ...props
}: SVGProps<SVGSVGElement> & { accent?: string }) {
  return (
    <svg
      viewBox="0 0 640 280"
      className={className}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <defs>
        <linearGradient id="sf-trace-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={accent} stopOpacity="0.15" />
          <stop offset="50%" stopColor={accent} stopOpacity="0.85" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#sf-trace-grad)" strokeWidth="1.25">
        <path className="sf-signal-trace" d="M40 180 C120 60, 200 220, 300 120 S480 40, 600 100" />
        <path className="sf-signal-trace" d="M20 90 C140 140, 220 40, 340 160 S500 220, 620 140" />
        <path className="sf-signal-trace" d="M60 240 C180 200, 260 260, 380 180 S520 100, 600 200" />
      </g>
      <g fill={accent}>
        <circle className="sf-signal-pulse" cx="120" cy="110" r="4" opacity="0.9" />
        <circle className="sf-signal-pulse" cx="300" cy="120" r="5" opacity="0.95" />
        <circle className="sf-signal-pulse" cx="460" cy="90" r="3.5" opacity="0.8" />
        <circle className="sf-signal-pulse" cx="540" cy="170" r="4.5" opacity="0.85" />
        <circle cx="220" cy="200" r="2.5" opacity="0.55" />
        <circle cx="380" cy="180" r="2.5" opacity="0.55" />
      </g>
      <g stroke={accent} strokeWidth="1" opacity="0.35">
        <rect x="286" y="106" width="28" height="28" rx="6" fill="none" />
        <path d="M300 106 V88 M300 134 V152 M286 120 H268 M314 120 H332" />
      </g>
    </svg>
  );
}

export function SignalField({
  children,
  className = "",
  intensity = "default",
}: {
  children?: ReactNode;
  className?: string;
  intensity?: "default" | "strong" | "subtle";
}) {
  const opacity =
    intensity === "strong" ? "opacity-100" : intensity === "subtle" ? "opacity-60" : "opacity-80";
  return (
    <div className={`sf-atmosphere relative ${className}`} data-layout="sf-signal-field">
      <div className={`pointer-events-none absolute inset-0 sf-grid-plane ${opacity}`} aria-hidden="true" />
      {children}
    </div>
  );
}

export function VerificationNode({
  label,
  active = false,
}: {
  label: string;
  active?: boolean;
}) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)]"
      data-layout="sf-verification-node"
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${active ? "sf-signal-pulse bg-[var(--product-accent,var(--accent-primary))]" : "bg-[var(--text-muted)]"}`}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

export function WorkflowRibbon({ children }: { children: ReactNode }) {
  return (
    <div className="sf-workflow-ribbon" data-layout="sf-workflow-ribbon">
      {children}
    </div>
  );
}

export function SecurityBrandPanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`} data-layout="sf-security-brand">
      <SignalTopologyArt className="pointer-events-none absolute inset-x-0 bottom-0 h-44 w-full opacity-40" />
      {children}
    </div>
  );
}
