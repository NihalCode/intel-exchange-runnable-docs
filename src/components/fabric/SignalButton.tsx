"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import {
  buttonDangerClass,
  buttonGhostClass,
  buttonIconClass,
  buttonPrimaryClass,
  buttonQuietClass,
  buttonSecondaryClass,
  buttonSuccessClass,
  buttonTertiaryClass,
  buttonToolbarClass,
} from "@/components/admin/ui/tokens";

export type SignalButtonVariant =
  | "primary"
  | "secondary"
  | "tertiary"
  | "ghost"
  | "quiet"
  | "danger"
  | "success"
  | "toolbar";

const VARIANT_CLASS: Record<SignalButtonVariant, string> = {
  primary: buttonPrimaryClass,
  secondary: buttonSecondaryClass,
  tertiary: buttonTertiaryClass,
  ghost: buttonGhostClass,
  quiet: buttonQuietClass,
  danger: buttonDangerClass,
  success: buttonSuccessClass,
  toolbar: buttonToolbarClass,
};

const SIZE_CLASS = {
  sm: "min-h-8 px-2.5 py-1 text-xs",
  md: "min-h-9",
} as const;

export function SignalButton({
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  type = "button",
  disabled,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: SignalButtonVariant;
  size?: keyof typeof SIZE_CLASS;
  loading?: boolean;
  children?: ReactNode;
}) {
  return (
    <button
      type={type}
      className={`${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} relative ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-variant={variant}
      {...rest}
    >
      <span className={loading ? "invisible" : undefined}>{children}</span>
      {loading ? (
        <span
          className="absolute inset-0 flex items-center justify-center"
          aria-hidden="true"
        >
          <span className="sf-spinner h-4 w-4" />
        </span>
      ) : null}
    </button>
  );
}

export function SignalIconButton({
  className = "",
  type = "button",
  loading = false,
  children,
  "aria-label": ariaLabel,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  children?: ReactNode;
  "aria-label": string;
}) {
  return (
    <button
      type={type}
      className={`${buttonIconClass} relative ${className}`}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      disabled={rest.disabled || loading}
      {...rest}
    >
      <span className={loading ? "invisible" : undefined}>{children}</span>
      {loading ? (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <span className="sf-spinner h-3.5 w-3.5" />
        </span>
      ) : null}
    </button>
  );
}
