"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
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
  nearTop: boolean;
  pointerInZone: boolean;
  pointerInChrome: boolean;
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
  chromeRef: RefObject<HTMLElement | null>;
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

function readScrollTop(): number {
  return (
    window.scrollY ||
    document.documentElement.scrollTop ||
    document.body.scrollTop ||
    0
  );
}

/** True when any scrollable ancestor (or the window) is past the top threshold. */
function isScrolledPastThreshold(threshold: number): boolean {
  if (readScrollTop() > threshold) return true;
  const nodes = document.querySelectorAll<HTMLElement>(
    "[data-top-chrome-scroll], main, .cx-docs-body"
  );
  for (const el of nodes) {
    if (el.scrollTop > threshold) return true;
  }
  return false;
}

function readNearTop(): boolean {
  return !isScrolledPastThreshold(TOP_CHROME_SCROLL_THRESHOLD_PX);
}

function readDesktopAutoHideEnabled(): boolean {
  return isDesktopAutoHideViewport({
    width: window.innerWidth,
    hoverFine: readHoverFine(),
  });
}

function subscribeViewport(onStoreChange: () => void) {
  window.addEventListener("resize", onStoreChange);
  const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
  mq.addEventListener?.("change", onStoreChange);
  return () => {
    window.removeEventListener("resize", onStoreChange);
    mq.removeEventListener?.("change", onStoreChange);
  };
}

function subscribeScroll(onStoreChange: () => void) {
  const onScroll = () => onStoreChange();
  window.addEventListener("scroll", onScroll, { passive: true, capture: true });
  window.addEventListener("resize", onScroll);
  return () => {
    window.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("resize", onScroll);
  };
}

function getShortcutHintClient() {
  return shortcutHintLabel(
    /Mac|iPhone|iPod|iPad/i.test(navigator.platform || navigator.userAgent)
  );
}

function getShortcutHintServer() {
  return "Ctrl K";
}

function subscribeNoop() {
  return () => {};
}

const EPHEMERAL_PIN_REASONS = [
  "pointer-zone",
  "pointer-chrome",
  "shortcut",
  "keyboard-focus",
] as const;

function clearEphemeralPins(prev: Set<string>): Set<string> {
  let changed = false;
  const next = new Set(prev);
  for (const reason of EPHEMERAL_PIN_REASONS) {
    if (next.delete(reason)) changed = true;
  }
  return changed ? next : prev;
}

export function TopChromeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const chromeRef = useRef<HTMLElement | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusSearchRef = useRef<FocusSearchFn | null>(null);
  const pinnedReasonsRef = useRef<Set<string>>(new Set());

  const [routeKey, setRouteKey] = useState(pathname);
  const [pinnedReasons, setPinnedReasons] = useState<Set<string>>(() => new Set());
  const [pointerInZone, setPointerInZone] = useState(false);
  const [pointerInChrome, setPointerInChrome] = useState(false);

  const autoHideEnabled = useSyncExternalStore(
    subscribeViewport,
    readDesktopAutoHideEnabled,
    () => false
  );
  const nearTop = useSyncExternalStore(subscribeScroll, readNearTop, () => true);
  const shortcutHint = useSyncExternalStore(
    subscribeNoop,
    getShortcutHintClient,
    getShortcutHintServer
  );

  // Reset ephemeral interaction state on client navigations.
  if (pathname !== routeKey) {
    setRouteKey(pathname);
    if (pointerInZone) setPointerInZone(false);
    if (pointerInChrome) setPointerInChrome(false);
    setPinnedReasons(clearEphemeralPins);
  }

  useEffect(() => {
    pinnedReasonsRef.current = pinnedReasons;
  }, [pinnedReasons]);

  const cancelHide = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    cancelHide();
  }, [pathname, cancelHide]);

  const pin = useCallback((reason: string) => {
    setPinnedReasons((prev) => {
      if (prev.has(reason)) return prev;
      return nextPinReasons(prev, { type: "pin", reason });
    });
  }, []);

  const unpin = useCallback((reason: string) => {
    setPinnedReasons((prev) => {
      if (!prev.has(reason)) return prev;
      return nextPinReasons(prev, { type: "unpin", reason });
    });
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
      // Never clear pointer state while a pin reason still holds the chrome open.
      if (pinnedReasonsRef.current.size > 0) return;
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
    // Two frames: first reveal chrome (pointer-events), then focus the input.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        focusSearchRef.current?.();
        unpin("shortcut");
      });
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
    function onKeyDown(e: KeyboardEvent) {
      if (!isSearchShortcut(e)) return;
      // Allow Shift+K for command palette; plain Ctrl/Cmd+K is docs search.
      if (e.shiftKey) return;
      e.preventDefault();
      focusSearch();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusSearch]);

  useEffect(() => {
    return () => cancelHide();
  }, [cancelHide]);

  const setPointerInZoneBound = useCallback(
    (inside: boolean) => {
      if (inside) {
        cancelHide();
        setPointerInZone(true);
      } else {
        setPointerInZone(false);
        scheduleHide();
      }
    },
    [cancelHide, scheduleHide]
  );

  const setPointerInChromeBound = useCallback(
    (inside: boolean) => {
      if (inside) {
        cancelHide();
        setPointerInChrome(true);
      } else {
        setPointerInChrome(false);
        scheduleHide();
      }
    },
    [cancelHide, scheduleHide]
  );

  const value = useMemo<TopChromeContextValue>(
    () => ({
      visible,
      autoHideEnabled,
      nearTop,
      pointerInZone,
      pointerInChrome,
      shortcutHint,
      pinnedReasons,
      reveal,
      scheduleHide,
      cancelHide,
      pin,
      unpin,
      setPointerInZone: setPointerInZoneBound,
      setPointerInChrome: setPointerInChromeBound,
      registerFocusSearch,
      focusSearch,
      chromeRef,
    }),
    [
      visible,
      autoHideEnabled,
      nearTop,
      pointerInZone,
      pointerInChrome,
      shortcutHint,
      pinnedReasons,
      reveal,
      scheduleHide,
      cancelHide,
      pin,
      unpin,
      setPointerInZoneBound,
      setPointerInChromeBound,
      registerFocusSearch,
      focusSearch,
    ]
  );

  return (
    <TopChromeContext.Provider value={value}>{children}</TopChromeContext.Provider>
  );
}
