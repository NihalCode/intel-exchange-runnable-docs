"use client";

import { type ReactNode, type RefObject } from "react";

import { useTopChrome } from "@/components/navigation/TopChromeProvider";
import { TOP_CHROME_ACTIVATION_ZONE_PX } from "@/lib/navigation/top-chrome-state";

export function TopActivationZone() {
  const { autoHideEnabled, setPointerInZone, visible } = useTopChrome();
  if (!autoHideEnabled) return null;

  return (
    <div
      data-testid="top-chrome-activation-zone"
      data-layout="cx-top-activation-zone"
      aria-hidden="true"
      className="cx-top-activation-zone"
      style={{ height: TOP_CHROME_ACTIVATION_ZONE_PX }}
      onMouseEnter={() => setPointerInZone(true)}
      onMouseLeave={() => setPointerInZone(false)}
      data-chrome-visible={visible ? "true" : "false"}
    />
  );
}

export function AutoHideTopChrome({ children }: { children: ReactNode }) {
  const {
    visible,
    autoHideEnabled,
    setPointerInChrome,
    pin,
    unpin,
    chromeRef,
  } = useTopChrome();

  return (
    <>
      <TopActivationZone />
      <div
        className="cx-top-chrome-spacer"
        aria-hidden="true"
        data-layout="cx-top-chrome-spacer"
      />
      <div
        ref={chromeRef as RefObject<HTMLDivElement>}
        data-testid="top-chrome"
        data-layout="cx-top-chrome"
        data-visible={visible ? "true" : "false"}
        data-auto-hide={autoHideEnabled ? "true" : "false"}
        className="cx-top-chrome"
        onMouseEnter={() => setPointerInChrome(true)}
        onMouseLeave={() => setPointerInChrome(false)}
        onFocusCapture={() => pin("keyboard-focus")}
        onBlurCapture={(e) => {
          const next = e.relatedTarget as Node | null;
          const root = chromeRef.current;
          if (root && next && root.contains(next)) return;
          unpin("keyboard-focus");
        }}
      >
        {children}
      </div>
    </>
  );
}
