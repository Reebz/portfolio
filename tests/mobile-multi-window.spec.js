// U9 — Mobile multi-window + taskbar recovery.
//
// Covers F2 (two windows can be open and dragged independently on a phone)
// and AE4 (a window dragged half off-screen is recovered by tapping its
// taskbar chip — U5's recoverWindowIfOffScreen).
//
// Touch drag is synthesized via the pointer API (`page.mouse.move` etc.
// dispatches mouse events that desktop.js's pointerdown/pointermove/pointerup
// handlers consume). U2 wired touch-action: none on title-bar so the touch
// pipeline routes to the same code path; we exercise it via mouse events
// because Playwright's touch synthesis is unreliable for sustained drags
// across this codebase's pointer pipeline.

const { test, expect } = require('@playwright/test');

test.describe('Mobile multi-window', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => sessionStorage.setItem('booted', '1'));
    await page.goto('/');
    await page.waitForTimeout(300);
  });

  test('F2: two windows open simultaneously and remain visible', async ({ page }) => {
    // Open About via hash to avoid any tap-synthesis flakiness, then Cavaro.
    await page.evaluate(() => { window.location.hash = '#window-about'; });
    await page.waitForTimeout(200);
    await page.evaluate(() => { window.location.hash = '#window-cavaro'; });
    await page.waitForTimeout(200);

    await expect(page.locator('#window-about')).toHaveAttribute('data-state', 'open');
    await expect(page.locator('#window-cavaro')).toHaveAttribute('data-state', 'open');
  });

  test('F2: dragging About Me by its title bar moves the window', async ({ page }) => {
    await page.evaluate(() => { window.location.hash = '#window-about'; });
    await page.waitForTimeout(200);
    await expect(page.locator('#window-about')).toHaveAttribute('data-state', 'open');

    const titleBar = page.locator('#window-about .title-bar');
    const startBox = await titleBar.boundingBox();
    expect(startBox).not.toBeNull();

    // Drag 60px right.
    await page.mouse.move(startBox.x + 30, startBox.y + 10);
    await page.mouse.down();
    await page.mouse.move(startBox.x + 90, startBox.y + 10, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(150);

    const endBox = await titleBar.boundingBox();
    expect(endBox.x).toBeGreaterThan(startBox.x);
  });

  test('AE4: a window dragged off the right edge recovers via its taskbar chip', async ({ page }) => {
    await page.evaluate(() => { window.location.hash = '#window-about'; });
    await page.waitForTimeout(200);
    await expect(page.locator('#window-about')).toHaveAttribute('data-state', 'open');

    // Shove About Me hard to the right so most of it sits off-screen. We
    // write directly to .style.left because the touch drag pipeline clamps
    // to viewport on every pointermove — defeating the test setup.
    await page.evaluate(() => {
      var el = document.getElementById('window-about');
      // Push left to viewport width minus a sliver, so the window's right
      // edge is well off-screen. clampWindowToViewport(open) does NOT fire
      // on a direct style write — only on drag end and viewport change.
      el.style.left = (window.innerWidth - 40) + 'px';
      el.style.top = '60px';
    });
    await page.waitForTimeout(100);

    // Confirm the title bar's center is off-screen before the recovery.
    const offBox = await page.locator('#window-about .title-bar').boundingBox();
    expect(offBox).not.toBeNull();
    const vw = page.viewportSize().width;
    // The title bar's right edge should extend past the viewport.
    expect(offBox.x + offBox.width).toBeGreaterThan(vw - 50);

    // Minimize then restore via the taskbar chip — the restore path runs
    // recoverWindowIfOffScreen on touch (desktop.js:1330).
    await page.evaluate(() => {
      var el = document.getElementById('window-about');
      // Trigger the minimize via the button so taskbar chip lights up.
      el.querySelector('[aria-label="Minimize"]').click();
    });
    await page.waitForTimeout(150);
    await expect(page.locator('#window-about')).toHaveAttribute('data-state', 'minimized');

    // Real tap on the taskbar chip — verified against the U2 touch-action
    // fixes from PR #9. See mobile-tap-discipline.spec.js for enforcement.
    const chip = page.locator('#taskbar [data-window-id="window-about"]');
    await expect(chip).toBeVisible();
    await chip.tap();
    await page.waitForTimeout(200);
    await expect(page.locator('#window-about')).toHaveAttribute('data-state', 'open');

    // After restore + recoverWindowIfOffScreen, the title bar should be
    // sufficiently within the viewport (≥44px visible width).
    const recoveredBox = await page.locator('#window-about .title-bar').boundingBox();
    expect(recoveredBox).not.toBeNull();
    const visibleW = Math.min(recoveredBox.x + recoveredBox.width, vw) - Math.max(recoveredBox.x, 0);
    expect(visibleW).toBeGreaterThanOrEqual(44);
  });
});
