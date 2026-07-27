/**
 * Pure helpers for premium auto-hide top chrome visibility.
 * Kept free of React so Vitest (node) can cover the state model.
 */

export const TOP_CHROME_SCROLL_THRESHOLD_PX = 24;
export const TOP_CHROME_HIDE_DELAY_MS = 750;
/** Slightly taller than 12px so the top-edge hover target is easy to hit. */
export const TOP_CHROME_ACTIVATION_ZONE_PX = 16;

export type TopChromePinReason =
  | "scroll-top"
  | "pointer-zone"
  | "pointer-chrome"
  | "keyboard-focus"
  | "search"
  | "shortcut"
  | "product-menu"
  | "search-scope-menu"
  | "user-menu"
  | "theme-menu"
  | "mobile-drawer"
  | "force-mobile";

export function computeTopChromeVisible(input: {
  pinnedReasons: ReadonlySet<string>;
  nearTop: boolean;
  pointerInZone: boolean;
  pointerInChrome: boolean;
  forceVisible: boolean;
}): boolean {
  if (input.forceVisible) return true;
  if (input.nearTop) return true;
  if (input.pointerInZone || input.pointerInChrome) return true;
  return input.pinnedReasons.size > 0;
}

export function nextPinReasons(
  current: ReadonlySet<string>,
  action: { type: "pin" | "unpin"; reason: string }
): Set<string> {
  const next = new Set(current);
  if (action.type === "pin") next.add(action.reason);
  else next.delete(action.reason);
  return next;
}

export function isDesktopAutoHideViewport(input: {
  width: number;
  hoverFine: boolean;
}): boolean {
  return input.width >= 1024 && input.hoverFine;
}

export function shortcutHintLabel(isMac: boolean): string {
  return isMac ? "⌘K" : "Ctrl K";
}

export function isSearchShortcut(event: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  repeat: boolean;
  isComposing?: boolean;
}): boolean {
  if (event.repeat || event.isComposing) return false;
  if (event.key.toLowerCase() !== "k") return false;
  return event.metaKey || event.ctrlKey;
}
