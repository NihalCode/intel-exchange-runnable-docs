import { test, expect, type Page } from "@playwright/test";

/**
 * Stress the premium auto-hide hover UI: races, pin stacks, shortcuts,
 * nested scroll, viewport thrash. Local only — no network side effects.
 */

async function expectChromeVisible(page: Page, visible: boolean) {
  await expect(page.getByTestId("top-chrome")).toHaveAttribute(
    "data-visible",
    visible ? "true" : "false",
    { timeout: 8000 }
  );
}

async function waitForDesktopAutoHide(page: Page) {
  await expect(page.getByTestId("top-chrome")).toHaveAttribute("data-auto-hide", "true", {
    timeout: 8000,
  });
}

async function scrollAwayFromTop(page: Page) {
  await page.evaluate(() => {
    let pad = document.querySelector<HTMLElement>("[data-testid='e2e-scroll-pad']");
    if (!pad) {
      pad = document.createElement("div");
      pad.setAttribute("data-testid", "e2e-scroll-pad");
      pad.style.height = "2400px";
      pad.setAttribute("aria-hidden", "true");
      document.body.appendChild(pad);
    }
    window.scrollTo(0, 1400);
    document.documentElement.scrollTop = 1400;
    document.body.scrollTop = 1400;
    window.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await page.waitForFunction(() => {
    const y =
      window.scrollY ||
      document.documentElement.scrollTop ||
      document.body.scrollTop ||
      0;
    return y > 100;
  });
}

function modK(page: Page, withShift = false) {
  const isMac = process.platform === "darwin";
  const mod = isMac ? "Meta" : "Control";
  return page.keyboard.press(withShift ? `${mod}+Shift+K` : `${mod}+K`);
}

test.describe("heavy stress: auto-hide hover UI", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("zone↔chrome zigzag and rapid leave/re-enter do not stick visible", async ({
    page,
  }) => {
    await page.goto("/docs/ctix");
    await waitForDesktopAutoHide(page);
    await scrollAwayFromTop(page);
    await expectChromeVisible(page, false);

    const zone = page.getByTestId("top-chrome-activation-zone");
    const chrome = page.getByTestId("top-chrome");

    for (let i = 0; i < 20; i++) {
      await zone.hover({ force: true, position: { x: 60 + (i % 5) * 40, y: 2 } });
      await chrome.hover({ position: { x: 120 + (i % 7) * 30, y: 18 } });
      await zone.hover({ force: true, position: { x: 200, y: 4 } });
    }

    // Settle away from top strip — must hide after delay.
    await page.mouse.move(500, 600);
    await expectChromeVisible(page, false);

    // Rapid re-enter within hide window cancels hide.
    await zone.hover({ force: true, position: { x: 80, y: 3 } });
    await expectChromeVisible(page, true);
    await page.mouse.move(500, 600);
    await page.waitForTimeout(200);
    await zone.hover({ force: true, position: { x: 90, y: 3 } });
    await page.waitForTimeout(900);
    await expectChromeVisible(page, true);
    await page.mouse.move(500, 600);
    await expectChromeVisible(page, false);
  });

  test("oscillate pointer Y for 8s then settle hidden", async ({ page }) => {
    await page.goto("/docs/ctix");
    await waitForDesktopAutoHide(page);
    await scrollAwayFromTop(page);

    const start = Date.now();
    let flip = false;
    while (Date.now() - start < 8000) {
      flip = !flip;
      await page.mouse.move(400, flip ? 4 : 520);
      await page.waitForTimeout(40);
    }

    await page.mouse.move(400, 520);
    await expectChromeVisible(page, false);
    // No pin residue after quiet period.
    await expect(page.getByTestId("top-chrome")).toHaveAttribute("data-pin-count", "0");
  });

  async function clearPinsAndPointer(page: Page) {
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
    });
    await page.mouse.move(400, 560);
    await expect
      .poll(async () => page.getByTestId("top-chrome").getAttribute("data-pin-count"), {
        timeout: 8000,
      })
      .toBe("0");
  }

  test("Ctrl/Cmd+K vs Ctrl/Cmd+Shift+K exclusivity while scrolled", async ({ page }) => {
    await page.goto("/docs/ctix");
    await waitForDesktopAutoHide(page);
    await scrollAwayFromTop(page);
    await expectChromeVisible(page, false);

    await modK(page, false);
    await expectChromeVisible(page, true);
    const search = page.getByTestId("docs-search").locator('input[type="search"]');
    await expect(search).toBeFocused();
    // Plain K must NOT open command palette.
    await expect(page.getByTestId("command-palette")).toHaveCount(0);

    await clearPinsAndPointer(page);
    await expectChromeVisible(page, false);

    await modK(page, true);
    await expectChromeVisible(page, true);
    const palette = page.getByTestId("command-palette");
    await expect(palette).toBeVisible({ timeout: 8000 });
    await clearPinsAndPointer(page);
    await expectChromeVisible(page, false);
  });

  test("pin stack: product focus + search; escape/blur clears to hide", async ({
    page,
  }) => {
    await page.goto("/docs/ctix");
    await waitForDesktopAutoHide(page);
    await scrollAwayFromTop(page);

    const product = page.getByLabel("Active documentation product");
    await product.focus();
    await expectChromeVisible(page, true);

    await modK(page, false);
    await expectChromeVisible(page, true);
    await page.waitForTimeout(900);
    await expectChromeVisible(page, true);

    await clearPinsAndPointer(page);
    await expectChromeVisible(page, false);
  });

  test("nested data-top-chrome-scroll past threshold hides chrome", async ({ page }) => {
    await page.goto("/agent");
    await waitForDesktopAutoHide(page);

    const nested = page.locator("[data-top-chrome-scroll]").first();
    if ((await nested.count()) === 0) {
      test.skip(true, "no nested top-chrome scroller on /agent in this build");
      return;
    }

    // Keep window at top; force a real nested overflow so scrollTop sticks.
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });

    const scrolled = await nested.evaluate((el) => {
      const node = el as HTMLElement;
      node.style.maxHeight = "180px";
      node.style.overflowY = "auto";
      if (node.scrollHeight <= node.clientHeight + 40) {
        const filler = document.createElement("div");
        filler.style.height = "1600px";
        filler.setAttribute("aria-hidden", "true");
        node.appendChild(filler);
      }
      node.scrollTop = 400;
      node.dispatchEvent(new Event("scroll", { bubbles: true }));
      return node.scrollTop;
    });
    expect(scrolled).toBeGreaterThan(24);

    await expect(page.getByTestId("top-chrome")).toHaveAttribute("data-near-top", "false", {
      timeout: 8000,
    });
    await page.mouse.move(400, 560);
    await expectChromeVisible(page, false);
  });

  test("viewport thrash across 1024px toggles auto-hide mode", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/docs/ctix");
    await waitForDesktopAutoHide(page);
    await scrollAwayFromTop(page);
    await expectChromeVisible(page, false);

    await page.setViewportSize({ width: 900, height: 900 });
    await expect(page.getByTestId("top-chrome")).toHaveAttribute("data-auto-hide", "false", {
      timeout: 8000,
    });
    await expectChromeVisible(page, true);

    await page.setViewportSize({ width: 1440, height: 900 });
    await waitForDesktopAutoHide(page);
    await scrollAwayFromTop(page);
    await expectChromeVisible(page, false);
  });

  test("route change clears ephemeral hover/pin state", async ({ page }) => {
    await page.goto("/docs/ctix");
    await waitForDesktopAutoHide(page);
    await scrollAwayFromTop(page);
    await page.getByTestId("top-chrome-activation-zone").hover({
      force: true,
      position: { x: 80, y: 3 },
    });
    await expectChromeVisible(page, true);

    await page.goto("/changelog");
    await waitForDesktopAutoHide(page);
    await scrollAwayFromTop(page);
    await page.mouse.move(400, 500);
    await expectChromeVisible(page, false);
  });
});
