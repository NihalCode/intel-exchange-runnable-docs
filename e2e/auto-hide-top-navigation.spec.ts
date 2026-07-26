import { test, expect, type Page } from "@playwright/test";

async function expectChromeVisible(page: Page, visible: boolean) {
  const chrome = page.getByTestId("top-chrome");
  await expect(chrome).toHaveAttribute("data-visible", visible ? "true" : "false", {
    timeout: 8000,
  });
}

async function waitForDesktopAutoHide(page: Page) {
  await expect(page.getByTestId("top-chrome")).toHaveAttribute("data-auto-hide", "true", {
    timeout: 8000,
  });
}

async function scrollAwayFromTop(page: Page) {
  await page.evaluate(() => {
    // Guarantee scrollable document height (short pages / hub shells).
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

async function pressSearchShortcut(page: Page) {
  const isMac = process.platform === "darwin";
  await page.keyboard.press(isMac ? "Meta+K" : "Control+K");
}

test.describe("premium auto-hide top navigation — production hard checks", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("docs: hide on scroll, reveal on zone, re-entry cancels hide, Ctrl/Cmd+K focuses search", async ({
    page,
  }) => {
    await page.goto("/docs/ctix");
    await waitForDesktopAutoHide(page);
    await expectChromeVisible(page, true);

    await scrollAwayFromTop(page);
    await expectChromeVisible(page, false);

    const zone = page.getByTestId("top-chrome-activation-zone");
    await zone.hover({ force: true, position: { x: 80, y: 3 } });
    await expectChromeVisible(page, true);

    // Move into chrome (not away) — must stay visible
    await page.getByTestId("top-chrome").hover({ position: { x: 200, y: 20 } });
    await page.waitForTimeout(850);
    await expectChromeVisible(page, true);

    // Leave chrome entirely — hide after delay
    await page.mouse.move(400, 500);
    await expectChromeVisible(page, false);

    await pressSearchShortcut(page);
    await expectChromeVisible(page, true);
    const search = page.getByTestId("docs-search").locator('input[type="search"]');
    await expect(search).toBeFocused();
    await search.fill("indicator");
    await expect(page.locator('[data-layout="cx-search-overlay"]')).toBeVisible({
      timeout: 8000,
    });

    await page.keyboard.press("Escape");
    await expect(page.locator('[data-layout="cx-search-overlay"]')).toHaveCount(0);
  });

  test("product selector focus pins chrome while scrolled", async ({ page }) => {
    await page.goto("/docs/ctix");
    await waitForDesktopAutoHide(page);
    await scrollAwayFromTop(page);
    await expectChromeVisible(page, false);

    const product = page.getByLabel("Active documentation product");
    // Keyboard focus (no pointer over chrome) must pin while scrolled.
    await product.focus();
    await expectChromeVisible(page, true);
    await page.waitForTimeout(850);
    await expectChromeVisible(page, true);

    await product.evaluate((el: HTMLSelectElement) => el.blur());
    // Blur alone is enough when the pointer is not over chrome.
    await expectChromeVisible(page, false);
  });

  test("keyboard focus keeps chrome visible; Tab does not lose controls", async ({
    page,
  }) => {
    await page.goto("/guides");
    await waitForDesktopAutoHide(page);
    await scrollAwayFromTop(page);
    await expectChromeVisible(page, false);

    await pressSearchShortcut(page);
    await expectChromeVisible(page, true);
    const search = page.getByTestId("docs-search").locator('input[type="search"]');
    await expect(search).toBeFocused();
    await page.keyboard.press("Tab");
    await expectChromeVisible(page, true);
  });

  for (const path of ["/docs/ctix/ping/ping", "/agent", "/authentication", "/changelog"]) {
    test(`route ${path}: Ctrl/Cmd+K reveals and focuses Search docs`, async ({ page }) => {
      await page.goto(path);
      await waitForDesktopAutoHide(page);
      await scrollAwayFromTop(page);
      await pressSearchShortcut(page);
      await expectChromeVisible(page, true);
      await expect(
        page.getByTestId("docs-search").locator('input[type="search"]')
      ).toBeFocused();
    });
  }

  test("no duplicate shortcut: plain Ctrl/Cmd+K does not open command palette", async ({
    page,
  }) => {
    await page.goto("/docs/ctix");
    await waitForDesktopAutoHide(page);
    await pressSearchShortcut(page);
    await expect(page.getByTestId("command-palette")).toHaveCount(0);
    await expect(
      page.getByTestId("docs-search").locator('input[type="search"]')
    ).toBeFocused();
  });

  test("reduced motion: chrome still toggles visibility attributes", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/docs/ctix");
    await waitForDesktopAutoHide(page);
    await scrollAwayFromTop(page);
    await expectChromeVisible(page, false);
    await pressSearchShortcut(page);
    await expectChromeVisible(page, true);
  });
});

test.describe("auto-hide mobile — no hover dependency", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("compact bar stays visible after scroll; drawer + search work", async ({ page }) => {
    await page.goto("/docs/ctix");
    const chrome = page.getByTestId("top-chrome");
    await expect(chrome).toHaveAttribute("data-auto-hide", "false");
    await expectChromeVisible(page, true);
    await scrollAwayFromTop(page);
    await page.waitForTimeout(400);
    await expectChromeVisible(page, true);

    await page.getByTestId("nav-drawer-toggle").click();
    await expect(page.getByLabel("Documentation navigation")).toBeVisible();
    await page.keyboard.press("Escape");

    await pressSearchShortcut(page);
    await expect(
      page.getByTestId("docs-search").locator('input[type="search"]')
    ).toBeFocused();
  });
});
