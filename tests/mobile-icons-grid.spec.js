// B4 + B5 — Mobile icon grid: true multi-column grid, no scroll.
//
// Covers the B4 (desktop pans vertically on mobile) and B5 (icons fall
// below the fold) regressions surfaced by real-device testing of the
// initial mobile port. The replacement CSS at style.css' mobile @media
// blocks turns #icon-grid into a viewport-bounded CSS Grid that stacks
// icons vertically (icon top, label bottom — matching the desktop
// pattern) across 3/5/8 columns by breakpoint.
//
// layoutIcons() still bails on touch (desktop.js:1044), so CSS Grid is
// the sole authority for icon placement on mobile.

const { test, expect } = require('@playwright/test');

test.describe('Mobile icon grid', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => sessionStorage.setItem('booted', '1'));
    await page.goto('/');
    // Wait for desktop.js to finish generating the icon set. The grid div is
    // static in HTML but its 14 children (5 system + 9 PROJECTS, see
    // desktop.js:1665-1827) are JS-injected; without this gate, computed
    // styles can be read before the @media block has applied on WebKit
    // emulation (race surfaced during U3-B4 debugging).
    await page.waitForFunction(
      () => document.querySelectorAll('#icon-grid .desktop-icon').length >= 14
    );
    await page.waitForTimeout(150);
  });

  test('B4: icon grid does not scroll', async ({ page }) => {
    const { scrollHeight, clientHeight } = await page.locator('#icon-grid').evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    // +1 tolerance for sub-pixel rounding.
    expect(scrollHeight).toBeLessThanOrEqual(clientHeight + 1);
  });

  test('B5: all icons fit above the taskbar (no clipping below the fold)', async ({ page }) => {
    const viewport = page.viewportSize();
    const taskbarH = await page.locator('#taskbar').boundingBox().then((b) => b.height);
    const visibleMax = viewport.height - taskbarH;
    const iconBottoms = await page.locator('.desktop-icon').evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect().bottom)
    );
    iconBottoms.forEach((bottom) => {
      expect(bottom).toBeLessThanOrEqual(visibleMax + 1);
    });
  });

  test('B4: icon grid uses multi-column layout', async ({ page }) => {
    const cols = await page.locator('#icon-grid').evaluate(
      (el) => getComputedStyle(el).gridTemplateColumns
    );
    // grid-template-columns resolves to space-separated track sizes; ≥3
    // tracks confirms we're past the single-column row-mode list.
    expect(cols.split(/\s+/).length).toBeGreaterThanOrEqual(3);
  });

  test('B5: icons stack vertically (icon top, label bottom)', async ({ page }) => {
    const flexDir = await page.locator('.desktop-icon').first().evaluate(
      (el) => getComputedStyle(el).flexDirection
    );
    expect(flexDir).toBe('column');
  });

  test('AE1: tapping an icon still launches the window', async ({ page }) => {
    // Real tap per the tap-discipline meta-test (mobile-tap-discipline.spec.js).
    const aboutIcon = page.locator('[data-window-id="window-about"]').first();
    await expect(aboutIcon).toBeVisible();
    await aboutIcon.tap();
    await page.waitForTimeout(300);
    // R9: About is in MAXIMIZE_DEFAULT — on a portrait phone the tap launches
    // it maximized. The proof here is "the tap launched the window", which a
    // maximized data-state satisfies just as well as a floating one.
    await expect(page.locator('#window-about')).toHaveAttribute('data-state', 'maximized');
  });
});
