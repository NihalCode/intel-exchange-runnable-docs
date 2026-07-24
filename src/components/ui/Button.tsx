"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import {
  SignalButton,
  type SignalButtonVariant,
} from "@/components/fabric/SignalButton";

/** Thin compatibility wrapper — prefer SignalButton for new UI. */
export function Button({
  variant = "primary",
  className = "",
  type = "button",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Extract<
    SignalButtonVariant,
    "primary" | "secondary" | "danger" | "ghost"
  >;
  children?: ReactNode;
}) {
  return (
    <SignalButton type={type} variant={variant} className={className} {...rest}>
      {children}
    </SignalButton>
  );
}
