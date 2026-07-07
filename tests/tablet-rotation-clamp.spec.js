const { test, expect } = require('@playwright/test');

test.describe('U10 tablet: zoom-1.5 clamp uses consistent units', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/gc.zgo.at/**', r => r.fulfill({ status: 200, body: '' }));
    await page.goto('/');
    await page.evaluate(() => sessionStorage.setItem('booted', '1'));
    await page.goto('/');
    await page.waitForTimeout(300);
  });

  test('iPad: rotation clamp keeps style.left consistent with bounding rect', async ({ page }) => {
    await page.evaluate(() => { window.location.hash = '#window-about'; });
    await expect(page.locator('#window-about')).toHaveAttribute('data-state', 'open');

    await page.evaluate(() => {
      var el = document.getElementById('window-about');
      var z = parseFloat(getComputedStyle(document.body).zoom) || 1;
      // Pin a width that fits the post-rotation landscape viewport. The About
      // window's natural width can exceed the narrow landscape width (and
      // varies by platform's WebKit font metrics), which makes "clamped fully
      // on-screen" unsatisfiable and the test platform-fragile.
      el.style.width = '400px';
      // Start hard against the right edge so the post-rotation clamp must move it.
      el.style.left = ((window.innerWidth / z) - 40) + 'px';
      el.style.top  = '20px';
    });

    const portrait = page.viewportSize();
    await page.setViewportSize({ width: portrait.height, height: portrait.width });
    // Wait for the emulated viewport to actually report the rotated width before
    // simulating the orientation change, so the clamp reads post-rotation dims
    // (a fixed sleep raced the reflow on slower CI and left the window unclamped).
    await page.waitForFunction((w) => window.innerWidth === w, portrait.height);
    await page.evaluate(() => {
      window.dispatchEvent(new Event('orientationchange'));
      window.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(300);

    const result = await page.locator('#window-about').evaluate((el) => {
      var rect = el.getBoundingClientRect();
      var z = parseFloat(getComputedStyle(document.body).zoom) || 1;
      var styleLeft = parseInt(el.style.left, 10) || 0;
      return { rectRight: rect.right, rectLeft: rect.left, rectWidth: rect.width, styleLeft: styleLeft, zoom: z, innerWidth: window.innerWidth };
    });

    expect(result.rectRight).toBeLessThanOrEqual(result.innerWidth + 2);
    expect(Math.abs(result.styleLeft * result.zoom - result.rectLeft)).toBeLessThan(2);
  });
});
