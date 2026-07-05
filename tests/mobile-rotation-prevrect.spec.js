const { test, expect } = require('@playwright/test');

test.describe('U10: maximize survives rotation without losing on-screen position', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/gc.zgo.at/**', r => r.fulfill({ status: 200, body: '' }));
    await page.goto('/');
    await page.evaluate(() => sessionStorage.setItem('booted', '1'));
    await page.goto('/');
    await page.waitForTimeout(300);
  });

  test('phone: maximize portrait, rotate landscape, restore — title bar visible', async ({ page }) => {
    await page.evaluate(() => { window.location.hash = '#window-about'; });
    // Portrait phones open resizable app windows maximized by default (R9), so
    // restore to floating first, then push the window off the right edge so the
    // prevRect the next maximize snapshots is genuinely off-screen — that is
    // what the rotation rewrite has to pull back into view.
    await expect(page.locator('#window-about')).toHaveAttribute('data-state', 'maximized');
    await page.locator('#window-about [aria-label="Maximize"]').tap();
    await expect(page.locator('#window-about')).toHaveAttribute('data-state', 'open');

    await page.evaluate(() => {
      var el = document.getElementById('window-about');
      el.style.left = (window.innerWidth - 80) + 'px';
      el.style.top  = '20px';
    });

    await page.locator('#window-about [aria-label="Maximize"]').tap();
    await expect(page.locator('#window-about')).toHaveAttribute('data-state', 'maximized');

    const portrait = page.viewportSize();
    await page.setViewportSize({ width: portrait.height, height: portrait.width });
    await page.evaluate(() => {
      window.dispatchEvent(new Event('orientationchange'));
      window.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(200);

    await page.locator('#window-about [aria-label="Maximize"]').tap();
    await expect(page.locator('#window-about')).toHaveAttribute('data-state', 'open');

    const newVw = portrait.height;
    const newVh = portrait.width;
    const tb = await page.locator('#window-about .title-bar').boundingBox();
    expect(tb).not.toBeNull();
    const visibleW = Math.min(tb.x + tb.width, newVw) - Math.max(tb.x, 0);
    const visibleH = Math.min(tb.y + tb.height, newVh) - Math.max(tb.y, 0);
    expect(visibleW).toBeGreaterThanOrEqual(44);
    expect(visibleH).toBeGreaterThanOrEqual(12);
  });
});
