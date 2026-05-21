// U2 / B1 + B2 + B3 — Mobile title-bar controls.
//
// Verifies the title-bar height-bump fallback (replaces U5's
// padding+content-box approach) works on touch devices:
//
// - B1: touch-action: manipulation on .title-bar-controls button
//       restores iOS Safari's tap-to-click synthesis that the inherited
//       .title-bar { touch-action: none } from U2 had suppressed.
// - B2 + B3: title-bar grows to ~44px on mobile; button visuals scale
//       to ~30x30 so the pressed-state feedback fills the visible
//       button and no transparent padding ring reveals title-bar blue.
//
// CRITICAL: title-bar control taps use page.tap() — NOT dispatchEvent.
// The dispatchEvent escape hatch is what masked the original B1 bug on
// real iOS devices; page.tap() exercises the same synthesis path Mobile
// Safari uses, which is the exact code path B1 fixes.
//
// The window is opened via the hash-deep-link route (matches the
// existing convention in mobile-multi-window.spec.js) because touch-icon
// taps can be occluded by overlapping absolute-positioned icons on iPad
// when layoutIcons() bails on touch. The control-button assertion is
// what matters here — that's where the B1 regression lived.
//
// Runs under iphone-14 and ipad-pro-11 projects via the testMatch in
// playwright.config.js (mobile-*.spec.js).

const { test, expect } = require('@playwright/test');

async function openAboutWindow(page) {
  await page.evaluate(() => { window.location.hash = '#window-about'; });
  await expect(page.locator('#window-about')).toHaveAttribute('data-state', 'open');
}

test.describe('Mobile title-bar controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => sessionStorage.setItem('booted', '1'));
    await page.goto('/');
    await page.waitForTimeout(300);
  });

  test('B1: tapping Close X closes the window', async ({ page }) => {
    await openAboutWindow(page);
    await page.locator('#window-about [aria-label="Close"]').tap();
    await expect(page.locator('#window-about')).toHaveAttribute('data-state', 'closed');
  });

  test('B1: tapping Minimize collapses the window', async ({ page }) => {
    await openAboutWindow(page);
    await page.locator('#window-about [aria-label="Minimize"]').tap();
    await expect(page.locator('#window-about')).toHaveAttribute('data-state', 'minimized');
  });

  test('B1: tapping Maximize fills the viewport', async ({ page }) => {
    await openAboutWindow(page);
    await page.locator('#window-about [aria-label="Maximize"]').tap();
    await expect(page.locator('#window-about')).toHaveAttribute('data-state', 'maximized');
  });

  test('B2: title-bar control buttons meet 30x30 hit-area floor', async ({ page }) => {
    await openAboutWindow(page);
    const closeBox = await page.locator('#window-about [aria-label="Close"]').boundingBox();
    expect(closeBox).not.toBeNull();
    expect(closeBox.width).toBeGreaterThanOrEqual(30);
    expect(closeBox.height).toBeGreaterThanOrEqual(30);
  });

  test('B2: title bar grows to ~44px on mobile', async ({ page }) => {
    await openAboutWindow(page);
    const titleBarBox = await page.locator('#window-about .title-bar').boundingBox();
    expect(titleBarBox).not.toBeNull();
    // Phone target is 44; tablet shares the same height in current rules.
    // Floor of 36 keeps the assertion robust if tablet later tunes lower.
    expect(titleBarBox.height).toBeGreaterThanOrEqual(36);
  });
});
