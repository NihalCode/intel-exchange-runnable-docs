"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import {
  buttonDangerClass,
  buttonGhostClass,
  buttonPrimaryClass,
  buttonSecondaryClass,
} from "@/components/admin/ui/tokens";

const VARIANTS = {
  primary: buttonPrimaryClass,
  secondary: buttonSecondaryClass,
  danger: buttonDangerClass,
  ghost: buttonGhostClass,
} as const;

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANTS;
  children?: ReactNode;
}) {
  return (
    <button type={type} className={`${VARIANTS[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}
