import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  TOP_CHROME_HIDE_DELAY_MS,
  computeTopChromeVisible,
  isDesktopAutoHideViewport,
  isSearchShortcut,
  nextPinReasons,
  shortcutHintLabel,
} from "@/lib/navigation/top-chrome-state";

describe("top-chrome-state", () => {
  it("nextPinReasons always returns a new Set instance", () => {
    const once = nextPinReasons(new Set(), { type: "pin", reason: "search" });
    const twice = nextPinReasons(once, { type: "pin", reason: "search" });
    expect(twice.has("search")).toBe(true);
    expect(twice).not.toBe(once);
  });

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is visible near top of page", () => {
    expect(
      computeTopChromeVisible({
        pinnedReasons: new Set(),
        nearTop: true,
        pointerInZone: false,
        pointerInChrome: false,
        forceVisible: false,
      })
    ).toBe(true);
  });

  it("hides when scrolled and nothing pins it", () => {
    expect(
      computeTopChromeVisible({
        pinnedReasons: new Set(),
        nearTop: false,
        pointerInZone: false,
        pointerInChrome: false,
        forceVisible: false,
      })
    ).toBe(false);
  });

  it("reveals for activation zone and chrome pointer", () => {
    expect(
      computeTopChromeVisible({
        pinnedReasons: new Set(),
        nearTop: false,
        pointerInZone: true,
        pointerInChrome: false,
        forceVisible: false,
      })
    ).toBe(true);
    expect(
      computeTopChromeVisible({
        pinnedReasons: new Set(),
        nearTop: false,
        pointerInZone: false,
        pointerInChrome: true,
        forceVisible: false,
      })
    ).toBe(true);
  });

  it("stays visible while search or menus are pinned", () => {
    expect(
      computeTopChromeVisible({
        pinnedReasons: new Set(["search"]),
        nearTop: false,
        pointerInZone: false,
        pointerInChrome: false,
        forceVisible: false,
      })
    ).toBe(true);
    expect(
      computeTopChromeVisible({
        pinnedReasons: new Set(["product-menu", "user-menu"]),
        nearTop: false,
        pointerInZone: false,
        pointerInChrome: false,
        forceVisible: false,
      })
    ).toBe(true);
  });

  it("forceVisible keeps mobile chrome reachable", () => {
    expect(
      computeTopChromeVisible({
        pinnedReasons: new Set(),
        nearTop: false,
        pointerInZone: false,
        pointerInChrome: false,
        forceVisible: true,
      })
    ).toBe(true);
  });

  it("pin/unpin mutates reason set immutably", () => {
    const a = nextPinReasons(new Set(), { type: "pin", reason: "search" });
    expect(a.has("search")).toBe(true);
    const b = nextPinReasons(a, { type: "unpin", reason: "search" });
    expect(b.has("search")).toBe(false);
    expect(a.has("search")).toBe(true);
  });

  it("detects Ctrl/Cmd+K and ignores repeats / IME", () => {
    expect(
      isSearchShortcut({ key: "k", metaKey: true, ctrlKey: false, repeat: false })
    ).toBe(true);
    expect(
      isSearchShortcut({ key: "k", metaKey: false, ctrlKey: true, repeat: false })
    ).toBe(true);
    expect(
      isSearchShortcut({ key: "k", metaKey: true, ctrlKey: false, repeat: true })
    ).toBe(false);
    expect(
      isSearchShortcut({
        key: "k",
        metaKey: true,
        ctrlKey: false,
        repeat: false,
        isComposing: true,
      })
    ).toBe(false);
  });

  it("labels shortcut for mac vs windows", () => {
    expect(shortcutHintLabel(true)).toBe("⌘K");
    expect(shortcutHintLabel(false)).toBe("Ctrl K");
  });

  it("enables desktop auto-hide only for wide fine-pointer viewports", () => {
    expect(isDesktopAutoHideViewport({ width: 1280, hoverFine: true })).toBe(true);
    expect(isDesktopAutoHideViewport({ width: 800, hoverFine: true })).toBe(false);
    expect(isDesktopAutoHideViewport({ width: 1280, hoverFine: false })).toBe(false);
  });

  it("documents hide delay constant", () => {
    expect(TOP_CHROME_HIDE_DELAY_MS).toBeGreaterThanOrEqual(600);
    expect(TOP_CHROME_HIDE_DELAY_MS).toBeLessThanOrEqual(900);
  });
});
