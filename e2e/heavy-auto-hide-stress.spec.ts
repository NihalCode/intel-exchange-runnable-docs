import { test, expect, type Page } from "@playwright/test";

/**
 * Stress Atlas shell keyboard + viewport behavior.
 * Retired: top-chrome hover auto-hide / pin stacks / activation zone races.
 */

async function expectAtlasShell(page: Page) {
  await expect(page.getByTestId("app-frame")).toHaveAttribute("data-atlas", "true");
  await expect(page.getByTestId("atlas-command-bar")).toBeVisible();
}

function modK(page: Page, withShift = false) {
  const isMac = process.platform === "darwin";
  const mod = isMac ? "Meta" : "Control";
  return page.keyboard.press(withShift ? `${mod}+Shift+K` : `${mod}+K`);
}

test.describe("heavy stress: Atlas shell navigation", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("rapid Ctrl/Cmd+K open/close does not stick palette open", async ({ page }) => {
    await page.goto("/docs/ctix");
    await expectAtlasShell(page);
    await expect(page.getByTestId("atlas-command-rail")).toBeVisible();

    // Open/close cycles with Esc close — proves palette cannot stick open under thrash.
    for (let i = 0; i < 6; i++) {
      await modK(page, false);
      await expect(page.getByTestId("command-palette")).toBeVisible({ timeout: 8000 });
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("command-palette")).toHaveCount(0);
    }

    await modK(page, false);
    await expect(page.getByTestId("command-palette")).toBeVisible({ timeout: 8000 });
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("command-palette")).toHaveCount(0);
  });

  test("preferPlainShortcut: plain K opens palette; Shift+K does not steal it", async ({
    page,
  }) => {
    await page.goto("/docs/ctix");
    await expectAtlasShell(page);

    await modK(page, false);
    await expect(page.getByTestId("command-palette")).toBeVisible({ timeout: 8000 });
    await page.keyboard.press("Escape");

    // Shift+K is ignored when preferPlainShortcut is true.
    await modK(page, true);
    await page.waitForTimeout(200);
    await expect(page.getByTestId("command-palette")).toHaveCount(0);
  });

  test("command bar + rail survive viewport thrash across 1024px", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/docs/ctix");
    await expectAtlasShell(page);
    await expect(page.getByTestId("atlas-command-rail")).toBeVisible();

    await page.setViewportSize({ width: 900, height: 900 });
    await expect(page.getByTestId("atlas-command-bar")).toBeVisible();
    await expect(page.getByTestId("nav-drawer-toggle")).toBeVisible();

    await page.setViewportSize({ width: 1440, height: 900 });
    await expectAtlasShell(page);
    await expect(page.getByTestId("atlas-command-rail")).toBeVisible();
  });

  test("route change keeps atlas shell markers", async ({ page }) => {
    await page.goto("/docs/ctix");
    await expectAtlasShell(page);

    await page.goto("/changelog");
    await expectAtlasShell(page);
    await modK(page, false);
    await expect(page.getByTestId("command-palette")).toBeVisible({ timeout: 8000 });
  });

  test("no retired top-chrome testids in Atlas shell", async ({ page }) => {
    await page.goto("/docs/ctix");
    await expectAtlasShell(page);
    await expect(page.getByTestId("top-chrome")).toHaveCount(0);
    await expect(page.getByTestId("top-chrome-activation-zone")).toHaveCount(0);
  });
});
