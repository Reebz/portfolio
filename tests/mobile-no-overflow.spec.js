// U3 (test-coverage plan) — Anti-overflow audit.
//
// Defends against B4 (mobile pan/scroll) and B5 (icons fall below the fold)
// by asserting that every chrome container that *could* overflow does not.
//
//   scrollHeight === clientHeight   →   no scrolled-out content
//
// Containers covered:
//   - #icon-grid (cold load)
//   - #taskbar    (cold load, EXCEPT #taskbar-buttons which is *designed* to
//                  horizontal-scroll when chips overflow — whitelisted)
//   - #start-menu (just-opened, and again after Programs submenu opens)
//   - .window-body (each open window at native size)
//
// Plus the B5 regression guard: every .desktop-icon's bounding-rect bottom
// sits above the taskbar (icon never falls below the fold).
//
// Per R1 we use real page.tap()/locator.tap() — no dispatchEvent.

const { test, expect } = require('@playwright/test');

// Tolerance for sub-pixel rounding when comparing scrollHeight vs clientHeight.
// Mirrors the +1 used in mobile-icons-grid.spec.js so the constant is identical
// across overflow specs.
const PX_TOLERANCE = 1;

test.describe('Mobile — no overflow on chrome containers', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => sessionStorage.setItem('booted', '1'));
    await page.goto('/');
    // Icon-grid children are JS-injected; wait for the full 14 (5 system + 9
    // projects) so computed styles are valid. Same gate as mobile-icons-grid.
    await page.waitForFunction(
      () => document.querySelectorAll('#icon-grid .desktop-icon').length >= 14
    );
    await page.waitForTimeout(150);
  });

  test('R3: #icon-grid scrollHeight === clientHeight after cold load', async ({ page }) => {
    const { scrollHeight, clientHeight } = await page.locator('#icon-grid').evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(scrollHeight).toBeLessThanOrEqual(clientHeight + PX_TOLERANCE);
  });

  test('R3: #taskbar itself does not vertically scroll', async ({ page }) => {
    // #taskbar-buttons IS designed to horizontal-scroll when chips overflow
    // (the B7 fix — see style.css mobile @media #taskbar-buttons overflow-x:
    // auto). Vertical overflow on the taskbar shell still indicates a bug —
    // chrome should fit inside the 44px-ish band.
    const { scrollHeight, clientHeight } = await page.locator('#taskbar').evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(scrollHeight).toBeLessThanOrEqual(clientHeight + PX_TOLERANCE);
  });

  test('R3: #start-menu fits its container when freshly opened', async ({ page }) => {
    await page.locator('#start-button').tap();
    await page.waitForTimeout(200);
    await expect(page.locator('#start-menu')).toBeVisible();

    // #start-menu has overflow: hidden (to clip off-stage slide-in submenus).
    // That means scrollHeight may be larger than clientHeight by design — the
    // assertion at the menu-root level would always pass. The real overflow
    // surface is .start-menu-items, which DOES scroll (overflow-y: auto), but
    // it should still fit its content at first open (no over-tall menu).
    const { scrollHeight, clientHeight } = await page.locator('#start-menu .start-menu-items').evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(scrollHeight).toBeLessThanOrEqual(clientHeight + PX_TOLERANCE);
  });

  test('R3: #start-menu still fits with Programs submenu open', async ({ page }) => {
    await page.locator('#start-button').tap();
    await page.waitForTimeout(200);

    // Open Programs submenu (slide-in approach — submenu absolute-positioned
    // inside #start-menu, sliding in from the right; parent menu doesn't
    // change height, but we audit both surfaces).
    const programsLi = page.locator('#start-menu > .start-menu-items > .has-submenu').first();
    const programsBtn = programsLi.locator(':scope > [aria-haspopup]');
    await programsBtn.tap();
    await page.waitForTimeout(250);

    // Parent menu items list still fits.
    const items = await page.locator('#start-menu .start-menu-items').evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(items.scrollHeight).toBeLessThanOrEqual(items.clientHeight + PX_TOLERANCE);

    // Submenu itself (the now-visible one) does not vertically over-scroll —
    // the Programs submenu has 6 items, well within typical viewport height.
    const submenuMetrics = await programsLi.locator(':scope > .start-submenu').evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(submenuMetrics.scrollHeight).toBeLessThanOrEqual(submenuMetrics.clientHeight + PX_TOLERANCE);
  });

  test('R3: open window-about .window-body does not over-scroll at native size', async ({ page }) => {
    await page.evaluate(() => { window.location.hash = '#window-about'; });
    await page.waitForTimeout(250);
    await expect(page.locator('#window-about')).toHaveAttribute('data-state', 'open');

    // .window-body legitimately has its own internal scroll when content
    // exceeds the window — that's expected app behavior. We assert that the
    // window itself isn't double-scrolling: scrollHeight of the OUTER .window
    // matches clientHeight (the chrome that wraps the body should not scroll).
    const { scrollHeight, clientHeight } = await page.locator('#window-about').evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(scrollHeight).toBeLessThanOrEqual(clientHeight + PX_TOLERANCE);
  });

  test('R5: every .desktop-icon sits above the taskbar (icon-fits-above-fold guard)', async ({ page }) => {
    const viewport = page.viewportSize();
    const taskbarH = await page.locator('#taskbar').boundingBox().then((b) => b.height);
    const visibleMax = viewport.height - taskbarH;
    const iconBottoms = await page.locator('.desktop-icon').evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect().bottom)
    );
    expect(iconBottoms.length).toBeGreaterThan(0);
    iconBottoms.forEach((bottom) => {
      expect(bottom).toBeLessThanOrEqual(visibleMax + PX_TOLERANCE);
    });
  });
});
