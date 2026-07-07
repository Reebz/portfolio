// U9 — Mobile orientation change.
//
// Covers F3 (open windows survive a portrait↔landscape rotation) and AE5
// (after rotation, all open title bars remain visible — U6's
// onViewportChange clamps each open window to the new viewport).
//
// Playwright cannot rotate an emulated device, but it CAN resize the
// viewport. We swap width and height, then dispatch `orientationchange`
// (and `resize`) so desktop.js:1649-1651's bound handlers fire.

const { test, expect } = require('@playwright/test');

test.describe('Mobile orientation change', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => sessionStorage.setItem('booted', '1'));
    await page.goto('/');
    await page.waitForTimeout(300);
  });

  test('F3: both windows remain open after rotating to landscape', async ({ page }) => {
    await page.evaluate(() => { window.location.hash = '#window-about'; });
    await page.waitForTimeout(150);
    await page.evaluate(() => { window.location.hash = '#window-cavaro'; });
    await page.waitForTimeout(150);

    // R9: About is in MAXIMIZE_DEFAULT (maximized on a portrait phone); Cavaro
    // is a fixed-size dialog and opens floating. Rotation never un-maximizes a
    // window, so About stays maximized on both sides of the flip. What this
    // test proves — both windows SURVIVE the rotation — holds with mixed states.
    await expect(page.locator('#window-about')).toHaveAttribute('data-state', 'maximized');
    await expect(page.locator('#window-cavaro')).toHaveAttribute('data-state', 'open');

    // Swap to landscape (height ↔ width). Read current viewport so this
    // test stays valid under both iphone-14 (390×844) and ipad-pro-11
    // (834×1194) projects.
    const portrait = page.viewportSize();
    await page.setViewportSize({ width: portrait.height, height: portrait.width });
    await page.evaluate(() => {
      window.dispatchEvent(new Event('orientationchange'));
      window.dispatchEvent(new Event('resize'));
    });
    // U6 debounces through rAF; give the frame time to settle.
    await page.waitForTimeout(150);

    // Both windows still present after the flip (About maximized, Cavaro open).
    await expect(page.locator('#window-about')).toHaveAttribute('data-state', 'maximized');
    await expect(page.locator('#window-cavaro')).toHaveAttribute('data-state', 'open');
  });

  test('AE5: title bars remain within the viewport after rotation', async ({ page }) => {
    await page.evaluate(() => { window.location.hash = '#window-about'; });
    await page.waitForTimeout(150);
    await page.evaluate(() => { window.location.hash = '#window-cavaro'; });
    await page.waitForTimeout(150);

    const portrait = page.viewportSize();
    await page.setViewportSize({ width: portrait.height, height: portrait.width });
    await page.evaluate(() => {
      window.dispatchEvent(new Event('orientationchange'));
      window.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(200);

    const newVw = portrait.height; // post-rotation width
    const newVh = portrait.width;  // post-rotation height

    for (const id of ['#window-about', '#window-cavaro']) {
      const tb = page.locator(id + ' .title-bar');
      const box = await tb.boundingBox();
      expect(box).not.toBeNull();
      // Title bar visible (≥44px of width and ≥12px of height inside viewport)
      // — same threshold U5's recoverWindowIfOffScreen uses (desktop.js:1590).
      const visibleW = Math.min(box.x + box.width, newVw) - Math.max(box.x, 0);
      const visibleH = Math.min(box.y + box.height, newVh) - Math.max(box.y, 0);
      expect(visibleW).toBeGreaterThanOrEqual(44);
      expect(visibleH).toBeGreaterThanOrEqual(12);
    }
  });
});
