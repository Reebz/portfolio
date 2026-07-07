// U9 — Mobile cold load.
//
// Covers F1 (no DOS-terminal fallback; the responsive Win98 desktop loads at
// phone size) and AE1 (a single tap on a desktop icon launches its window).
//
// Runs under the iphone-14 and ipad-pro-11 projects in playwright.config.js.
//
// Real-tap discipline: every tap interaction uses `page.tap()` / `locator.tap()`.
// Earlier revisions used a synthetic click dispatch to dodge a touch-action
// propagation issue; U1 of the mobile-test-coverage plan audited those calls
// against the U2 height-bump / touch-action fixes from PR #9 and confirmed
// real taps now fire the click handler. The `mobile-tap-discipline.spec.js`
// meta-test enforces this going forward.

const { test, expect } = require('@playwright/test');
const { mockGoatCounter } = require('./_helpers');

// Stub gc.zgo.at / goatcounter.com so CI never hits real analytics.
test.beforeEach(async ({ page }) => {
  await mockGoatCounter(page);
});

test.describe('Mobile cold load', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => sessionStorage.setItem('booted', '1'));
    await page.goto('/');
    await page.waitForTimeout(300);
  });

  test('U1: DOS-terminal fallback markup is gone', async ({ page }) => {
    await expect(page.locator('#mobile-view')).toHaveCount(0);
    await expect(page.locator('#dos-terminal')).toHaveCount(0);
    await expect(page.locator('#dos-file-list')).toHaveCount(0);
  });

  test('U2: desktop chrome is visible at phone size', async ({ page }) => {
    await expect(page.locator('#desktop')).toBeVisible();
    await expect(page.locator('#taskbar')).toBeVisible();
    await expect(page.locator('#start-button')).toBeVisible();
    await expect(page.locator('#icon-grid')).toBeVisible();
  });

  test('U2: body zoom is 1 on touch, not 1.5', async ({ page }) => {
    const zoom = await page.evaluate(() => {
      // Some browsers report computed style zoom as a numeric string; the
      // touch-media-query block sets zoom: 1 on html, body.
      return window.getComputedStyle(document.body).zoom;
    });
    // Accept "1", "normal" (some engines), or "1.0" — anything that's not 1.5.
    expect(zoom).not.toMatch(/1\.5/);
  });

  test('AE1: tapping About Me icon opens the window', async ({ page }) => {
    const aboutIcon = page.locator('[data-window-id="window-about"]');
    await expect(aboutIcon).toBeVisible();
    await aboutIcon.tap();
    await page.waitForTimeout(300);
    // These phone projects are all portrait (<480px), where resizable app
    // windows open maximized by default (R9) — the tap still launches the
    // window, it just arrives maximized rather than floating.
    await expect(page.locator('#window-about')).toHaveAttribute('data-state', 'maximized');
  });
});
