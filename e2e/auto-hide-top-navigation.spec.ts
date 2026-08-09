import { test, expect, type Page } from "@playwright/test";

/**
 * Atlas shell navigation — auto-hide top chrome is retired.
 * Covers command rail/bar presence, Ctrl/Cmd+K palette, and mobile drawer.
 */

async function expectAtlasShell(page: Page) {
  const frame = page.getByTestId("app-frame");
  await expect(frame).toHaveAttribute("data-atlas", "true");
  await expect(page.getByTestId("atlas-command-bar")).toBeVisible();
}

async function pressSearchShortcut(page: Page) {
  const isMac = process.platform === "darwin";
  await page.keyboard.press(isMac ? "Meta+K" : "Control+K");
}

async function expectCommandPaletteOpen(page: Page) {
  const palette = page.getByTestId("command-palette");
  await expect(palette).toBeVisible({ timeout: 8000 });
  await expect(palette.locator("input").first()).toBeFocused();
}

test.describe("Atlas shell navigation — desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("docs: atlas frame, command rail/bar, Ctrl/Cmd+K opens palette", async ({ page }) => {
    await page.goto("/docs/ctix");
    await expectAtlasShell(page);
    await expect(page.getByTestId("atlas-command-rail")).toBeVisible();

    await pressSearchShortcut(page);
    await expectCommandPaletteOpen(page);

    await page.keyboard.type("indicator");
    await expect(page.getByTestId("command-palette")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("command-palette")).toHaveCount(0);
  });

  test("keyboard: Tab reaches command-bar search trigger after palette dismiss", async ({
    page,
  }) => {
    await page.goto("/guides");
    await expectAtlasShell(page);

    await pressSearchShortcut(page);
    await expectCommandPaletteOpen(page);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("command-palette")).toHaveCount(0);

    const trigger = page.getByTestId("atlas-search-trigger");
    await trigger.focus();
    await expect(trigger).toBeFocused();
    await page.keyboard.press("Tab");
    // Theme toggle or auth control should receive focus — stay within command bar.
    const bar = page.getByTestId("atlas-command-bar");
    await expect(bar.locator(":focus")).toHaveCount(1);
  });

  for (const path of ["/docs/ctix/ping/ping", "/agent", "/authentication", "/changelog"]) {
    test(`route ${path}: Ctrl/Cmd+K opens command palette (preferPlainShortcut)`, async ({
      page,
    }) => {
      await page.goto(path);
      await expectAtlasShell(page);
      await pressSearchShortcut(page);
      await expectCommandPaletteOpen(page);
    });
  }

  test("preferPlainShortcut: plain Ctrl/Cmd+K opens command palette", async ({ page }) => {
    await page.goto("/docs/ctix");
    await expectAtlasShell(page);
    await pressSearchShortcut(page);
    await expect(page.getByTestId("command-palette")).toBeVisible({ timeout: 8000 });
  });

  test("product selector remains usable without top-chrome pin semantics", async ({ page }) => {
    await page.goto("/docs/ctix");
    await expectAtlasShell(page);
    const product = page.getByLabel("Active documentation product");
    await product.focus();
    await expect(product).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("atlas-command-bar")).toBeVisible();
  });

  test("theme toggle still switches dark/light (dark-first default)", async ({ page }) => {
    await page.goto("/docs/ctix/ping/ping");
    await expectAtlasShell(page);

    // Atlas defaults dark; click toggle into light then back.
    await page.evaluate(() => {
      document.documentElement.classList.add("dark");
      try {
        localStorage.setItem("theme", "dark");
      } catch {
        /* ignore */
      }
    });
    const toggle = page.getByTestId("theme-toggle");
    await toggle.click();
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.classList.contains("dark")))
      .toBe(false);

    await toggle.click();
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.classList.contains("dark")))
      .toBe(true);

    // No retired top-chrome visibility attributes.
    await expect(page.getByTestId("top-chrome")).toHaveCount(0);
  });
});

test.describe("Atlas shell navigation — mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("nav-drawer-toggle opens drawer; Ctrl/Cmd+K opens palette", async ({ page }) => {
    await page.goto("/docs/ctix");
    await expect(page.getByTestId("app-frame")).toHaveAttribute("data-atlas", "true");
    await expect(page.getByTestId("atlas-command-bar")).toBeVisible();

    await page.getByTestId("nav-drawer-toggle").click();
    await expect(page.getByLabel("Command navigation")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByLabel("Command navigation")).toHaveCount(0);

    await pressSearchShortcut(page);
    await expectCommandPaletteOpen(page);
  });
});
