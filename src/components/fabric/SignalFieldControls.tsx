"use client";

import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { inputClass } from "@/components/admin/ui/tokens";

function FieldShell({
  id,
  label,
  hint,
  error,
  children,
}: {
  id?: string;
  label?: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm" htmlFor={id}>
      {label ? (
        <span className="font-medium text-[var(--text-primary)]">{label}</span>
      ) : null}
      {children}
      {error ? (
        <span className="text-xs text-[var(--danger)]" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="text-xs text-[var(--text-muted)]">{hint}</span>
      ) : null}
    </label>
  );
}

export function SignalInput({
  label,
  hint,
  error,
  className = "",
  id,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string | null;
}) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        className={`sf-control ${inputClass} ${error ? "border-[var(--danger)]" : ""} ${className}`}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
    </FieldShell>
  );
}

export function SignalTextarea({
  label,
  hint,
  error,
  className = "",
  id,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  hint?: string;
  error?: string | null;
}) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <textarea
        id={id}
        className={`sf-control ${inputClass} min-h-[5rem] ${error ? "border-[var(--danger)]" : ""} ${className}`}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
    </FieldShell>
  );
}

export function SignalSelect({
  label,
  hint,
  error,
  className = "",
  id,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  hint?: string;
  error?: string | null;
  children?: ReactNode;
}) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <select
        id={id}
        className={`sf-control ${inputClass} ${error ? "border-[var(--danger)]" : ""} ${className}`}
        aria-invalid={error ? true : undefined}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  );
}

export function SignalCheckbox({
  label,
  className = "",
  id,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={`inline-flex items-center gap-2 text-sm text-[var(--text-primary)] ${className}`} htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        className="h-4 w-4 rounded border-[var(--border-default)] text-[var(--accent-primary)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        {...rest}
      />
      <span>{label}</span>
    </label>
  );
}

export function SignalSwitch({
  label,
  checked,
  onChange,
  id,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`inline-flex items-center gap-2 text-sm text-[var(--text-primary)] disabled:opacity-50 ${""}`}
    >
      <span
        className={`relative h-5 w-9 rounded-full transition-colors ${
          checked ? "bg-[var(--accent-primary)]" : "bg-[var(--surface-muted)]"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-4" : ""
          }`}
        />
      </span>
      <span>{label}</span>
    </button>
  );
}

export function SignalSearch({
  label = "Search",
  className = "",
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <SignalInput
      type="search"
      label={label}
      className={className}
      autoComplete="off"
      {...rest}
    />
  );
}
