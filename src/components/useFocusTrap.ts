"use client";

import { useEffect, useRef } from "react";
import { focusTrapNextIndex } from "@/lib/a11y";

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Keeps keyboard focus inside a modal surface and returns it to the opener.
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(
  active: boolean,
  onClose: () => void
) {
  const containerRef = useRef<T | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!active) return;

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const container = containerRef.current;
    if (!container) return;

    const focusFirst = () => {
      const first = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (first ?? container).focus();
    };
    queueMicrotask(focusFirst);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const controls = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      );
      const nextIndex = focusTrapNextIndex(
        controls.indexOf(document.activeElement as HTMLElement),
        controls.length,
        event.shiftKey
      );
      if (nextIndex < 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      if (
        controls.indexOf(document.activeElement as HTMLElement) < 0 ||
        nextIndex === 0 && !event.shiftKey ||
        nextIndex === controls.length - 1 && event.shiftKey
      ) {
        event.preventDefault();
        controls[nextIndex].focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (restoreFocusRef.current?.isConnected) restoreFocusRef.current.focus();
    };
  }, [active]);

  return containerRef;
}
