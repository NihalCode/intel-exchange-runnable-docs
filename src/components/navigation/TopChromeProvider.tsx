"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

import {
  TOP_CHROME_HIDE_DELAY_MS,
  TOP_CHROME_SCROLL_THRESHOLD_PX,
  computeTopChromeVisible,
  isDesktopAutoHideViewport,
  isSearchShortcut,
  nextPinReasons,
  shortcutHintLabel,
} from "@/lib/navigation/top-chrome-state";

type FocusSearchFn = () => void;

type TopChromeContextValue = {
  visible: boolean;
  autoHideEnabled: boolean;
  shortcutHint: string;
  pinnedReasons: ReadonlySet<string>;
  reveal: (reason?: string) => void;
  scheduleHide: () => void;
  cancelHide: () => void;
  pin: (reason: string) => void;
  unpin: (reason: string) => void;
  setPointerInZone: (inside: boolean) => void;
  setPointerInChrome: (inside: boolean) => void;
  registerFocusSearch: (fn: FocusSearchFn | null) => void;
  focusSearch: () => void;
  chromeRef: React.RefObject<HTMLElement | null>;
};

const TopChromeContext = createContext<TopChromeContextValue | null>(null);

export function useTopChrome(): TopChromeContextValue {
  const ctx = useContext(TopChromeContext);
  if (!ctx) {
    throw new Error("useTopChrome must be used within TopChromeProvider");
  }
  return ctx;
}

export function useOptionalTopChrome(): TopChromeContextValue | null {
  return useContext(TopChromeContext);
}

function readHoverFine(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

export function TopChromeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const chromeRef = useRef<HTMLElement | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusSearchRef = useRef<FocusSearchFn | null>(null);
  const rafScrollRef = useRef<number | null>(null);

  const [pinnedReasons, setPinnedReasons] = useState<Set<string>>(() => new Set());
  const [nearTop, setNearTop] = useState(true);
  const [pointerInZone, setPointerInZone] = useState(false);
  const [pointerInChrome, setPointerInChrome] = useState(false);
  const [autoHideEnabled, setAutoHideEnabled] = useState(false);
  const [shortcutHint, setShortcutHint] = useState("Ctrl K");

  const cancelHide = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const pin = useCallback((reason: string) => {
    setPinnedReasons((prev) => nextPinReasons(prev, { type: "pin", reason }));
  }, []);

  const unpin = useCallback((reason: string) => {
    setPinnedReasons((prev) => nextPinReasons(prev, { type: "unpin", reason }));
  }, []);

  const reveal = useCallback(
    (reason?: string) => {
      cancelHide();
      if (reason) pin(reason);
    },
    [cancelHide, pin]
  );

  const scheduleHide = useCallback(() => {
    cancelHide();
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null;
      setPointerInZone(false);
      setPointerInChrome(false);
    }, TOP_CHROME_HIDE_DELAY_MS);
  }, [cancelHide]);

  const registerFocusSearch = useCallback((fn: FocusSearchFn | null) => {
    focusSearchRef.current = fn;
  }, []);

  const focusSearch = useCallback(() => {
    cancelHide();
    pin("search");
    pin("shortcut");
    requestAnimationFrame(() => {
      focusSearchRef.current?.();
      // Shortcut pin is transient — keep search pin while focused.
      unpin("shortcut");
    });
  }, [cancelHide, pin, unpin]);

  const forceVisible = !autoHideEnabled;
  const visible = computeTopChromeVisible({
    pinnedReasons,
    nearTop,
    pointerInZone,
    pointerInChrome,
    forceVisible,
  });

  useEffect(() => {
    setShortcutHint(
      shortcutHintLabel(
        typeof navigator !== "undefined" &&
          /Mac|iPhone|iPod|iPad/i.test(navigator.platform || navigator.userAgent)
      )
    );

    function syncViewport() {
      const enabled = isDesktopAutoHideViewport({
        width: window.innerWidth,
        hoverFine: readHoverFine(),
      });
      setAutoHideEnabled(enabled);
      if (!enabled) {
        cancelHide();
        setNearTop(true);
        setPointerInZone(false);
        setPointerInChrome(false);
      }
    }
    syncViewport();
    window.addEventListener("resize", syncViewport);
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    mq.addEventListener?.("change", syncViewport);
    return () => {
      window.removeEventListener("resize", syncViewport);
      mq.removeEventListener?.("change", syncViewport);
    };
  }, [cancelHide]);

  useEffect(() => {
    cancelHide();
    setPointerInZone(false);
    setPointerInChrome(false);
    setPinnedReasons((prev) => {
      const next = new Set(prev);
      next.delete("pointer-zone");
      next.delete("pointer-chrome");
      next.delete("shortcut");
      next.delete("keyboard-focus");
      return next;
    });
  }, [pathname, cancelHide]);

  useEffect(() => {
    function onScroll() {
      if (rafScrollRef.current != null) return;
      rafScrollRef.current = window.requestAnimationFrame(() => {
        rafScrollRef.current = null;
        const y =
          window.scrollY ||
          document.documentElement.scrollTop ||
          document.body.scrollTop ||
          0;
        setNearTop(y <= TOP_CHROME_SCROLL_THRESHOLD_PX);
      });
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafScrollRef.current != null) {
        cancelAnimationFrame(rafScrollRef.current);
      }
    };
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!isSearchShortcut(e)) return;
      e.preventDefault();
      focusSearch();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusSearch]);

  useEffect(() => {
    return () => cancelHide();
  }, [cancelHide]);

  const value = useMemo<TopChromeContextValue>(
    () => ({
      visible,
      autoHideEnabled,
      shortcutHint,
      pinnedReasons,
      reveal,
      scheduleHide,
      cancelHide,
      pin,
      unpin,
      setPointerInZone: (inside) => {
        if (inside) {
          cancelHide();
          setPointerInZone(true);
        } else {
          setPointerInZone(false);
          scheduleHide();
        }
      },
      setPointerInChrome: (inside) => {
        if (inside) {
          cancelHide();
          setPointerInChrome(true);
        } else {
          setPointerInChrome(false);
          scheduleHide();
        }
      },
      registerFocusSearch,
      focusSearch,
      chromeRef,
    }),
    [
      visible,
      autoHideEnabled,
      shortcutHint,
      pinnedReasons,
      reveal,
      scheduleHide,
      cancelHide,
      pin,
      unpin,
      registerFocusSearch,
      focusSearch,
    ]
  );

  return (
    <TopChromeContext.Provider value={value}>{children}</TopChromeContext.Provider>
  );
}
