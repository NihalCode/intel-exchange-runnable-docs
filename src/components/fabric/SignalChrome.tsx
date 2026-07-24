"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

export function SignalTabs({
  tabs,
  value,
  onChange,
  className = "",
}: {
  tabs: { id: string; label: string; panel: ReactNode }[];
  value?: string;
  onChange?: (id: string) => void;
  className?: string;
}) {
  const autoId = useId();
  const [internal, setInternal] = useState(tabs[0]?.id ?? "");
  const active = value ?? internal;
  const setActive = onChange ?? setInternal;
  const listRef = useRef<HTMLDivElement>(null);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const ids = tabs.map((t) => t.id);
      const idx = ids.indexOf(active);
      if (idx < 0) return;
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        const next =
          event.key === "ArrowRight"
            ? ids[(idx + 1) % ids.length]
            : ids[(idx - 1 + ids.length) % ids.length];
        setActive(next);
      }
    },
    [active, setActive, tabs]
  );

  const activeTab = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div className={className}>
      <div
        ref={listRef}
        role="tablist"
        className="sf-tabs"
        onKeyDown={onKeyDown}
      >
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`${autoId}-tab-${tab.id}`}
              className="sf-tab"
              aria-selected={selected}
              aria-controls={`${autoId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {activeTab ? (
        <div
          role="tabpanel"
          id={`${autoId}-panel-${activeTab.id}`}
          aria-labelledby={`${autoId}-tab-${activeTab.id}`}
          className="pt-4"
        >
          {activeTab.panel}
        </div>
      ) : null}
    </div>
  );
}

export function SignalSegmentedControl({
  options,
  value,
  onChange,
  ariaLabel,
  className = "",
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`sf-segmented ${className}`}
    >
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          data-active={opt.id === value}
          className="rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]"
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function SignalBadge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-[var(--surface-muted)] text-[var(--text-secondary)]",
    success: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
    warning: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
    danger: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
    info: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function SignalStatus({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  return (
    <SignalBadge tone={tone}>
      <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-current opacity-80" aria-hidden />
      {label}
    </SignalBadge>
  );
}

export function SignalDialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  security = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  security?: boolean;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const node = panelRef.current;
    const focusable = node?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusable?.focus();
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="sf-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? `${titleId}-desc` : undefined}
        data-security={security || undefined}
        className="sf-dialog-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold text-[var(--text-heading)]">
          {title}
        </h2>
        {description ? (
          <p id={`${titleId}-desc`} className="mt-1 text-sm text-[var(--text-secondary)]">
            {description}
          </p>
        ) : null}
        <div className="mt-4">{children}</div>
        {footer ? <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}

export function SignalDrawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: ReactNode;
}) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/30"
        aria-label="Close drawer"
        onClick={onClose}
      />
      <aside
        className="sf-drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-base font-semibold text-[var(--text-heading)]">
            {title}
          </h2>
          <button
            type="button"
            className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </aside>
    </div>
  );
}
