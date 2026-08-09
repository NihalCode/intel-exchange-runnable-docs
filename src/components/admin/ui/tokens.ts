/**
 * Shared UI class tokens for docs + enterprise admin.
 * Prefer CSS variables from globals.css so light/dark stay in sync.
 */

export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background-page)]";

export const inputClass = `rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${focusRing}`;

export const buttonPrimaryClass = `sf-btn-primary inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--accent-primary)] px-3 py-2 text-sm font-medium text-[var(--text-inverse)] hover:bg-[var(--accent-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50 transition-[box-shadow,transform,background-color] duration-150 motion-reduce:transition-none active:translate-y-px ${focusRing}`;

export const buttonSecondaryClass = `inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-[var(--surface-muted)] transition-[background-color,border-color] duration-150 motion-reduce:transition-none ${focusRing}`;

export const buttonTertiaryClass = `inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-transparent bg-[var(--surface-muted)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] hover:border-[var(--border-default)] disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;

export const buttonDangerClass = `inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-red-300 bg-[var(--danger-soft)] px-3 py-2 text-sm font-medium text-red-800 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900 dark:text-red-200 dark:hover:bg-red-950 ${focusRing}`;

export const buttonSuccessClass = `inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-emerald-300 bg-[var(--success-soft,color-mix(in_srgb,var(--success)_12%,transparent))] px-3 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-900 dark:text-emerald-200 dark:hover:bg-emerald-950 ${focusRing}`;

export const buttonGhostClass = `inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] px-2 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)] ${focusRing}`;

export const buttonQuietClass = `inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] px-2 py-1 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-muted)]/60 ${focusRing}`;

export const buttonToolbarClass = `inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;

export const buttonIconClass = `inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;

export const cardClass =
  "rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--surface-raised)_88%,transparent)] p-4 shadow-[var(--shadow-card)]";

export const tableClass = "w-full min-w-[640px] text-left text-sm text-[var(--text-primary)]";

export const linkClass = `rounded-[var(--radius-sm)] text-[var(--text-link)] underline-offset-2 hover:underline hover:text-[var(--text-link-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${focusRing}`;

export const navLinkClass =
  "rounded-[var(--radius-sm)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]";

export const navLinkActiveClass =
  "rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--atlas-signal)_12%,var(--surface-muted))] px-2 py-1 text-xs font-medium text-[var(--text-link)] shadow-[inset_2px_0_0_var(--atlas-signal)]";

export const pageTitleClass =
  "text-2xl font-medium tracking-[-0.03em] text-[var(--text-heading)] sm:text-3xl";

export const eyebrowClass =
  "atlas-micro-label text-[var(--atlas-signal)]";

export const mutedTextClass = "text-sm text-[var(--atlas-text-secondary)]";

/** Product accent CSS variable name helpers */
export const PRODUCT_ACCENT_VARS = {
  ctix: "var(--product-ctix)",
  csap: "var(--product-csap)",
  orchestrate: "var(--product-orchestrate)",
  cftr: "var(--product-cftr)",
} as const;

export type ProductAccentId = keyof typeof PRODUCT_ACCENT_VARS;

export function productAccentVar(productId: string): string {
  if (productId in PRODUCT_ACCENT_VARS) {
    return PRODUCT_ACCENT_VARS[productId as ProductAccentId];
  }
  return "var(--accent-primary)";
}

export function productAccentClass(productId: string): string {
  switch (productId) {
    case "ctix":
      return "product-accent-ctix";
    case "csap":
      return "product-accent-csap";
    case "orchestrate":
      return "product-accent-orchestrate";
    case "cftr":
      return "product-accent-cftr";
    default:
      return "product-accent-ctix";
  }
}
