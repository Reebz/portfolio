// U10 — Maximize-by-default on portrait phones (R9 / AE1).
//
// On portrait phones (touch, <480px) the resizable app windows open maximized
// (full width, full height above the taskbar) instead of cascading as a
// floating window that's unusable at 390px wide. Small fixed-size dialogs
// (Calculator, Minesweeper, Run, ICQ, Clock, Visitor Counter) keep their
// native size and open centered. Landscape phones (480-767px) are unaffected.
//
// Runs under the iphone-se / iphone-14 / iphone-14-pro-max projects (the
// mobile-* testMatch). Napster has no desktop icon — it launches from the
// Start menu — so we reach it through its hash deep-link, which drives the
// same launcher → openWindow path a tap would.

const { test, expect } = require('@playwright/test');
const { mockGoatCounter } = require('./_helpers');

test.beforeEach(async ({ page }) => {
  await mockGoatCounter(page);
  await page.goto('/');
  await page.evaluate(() => sessionStorage.setItem('booted', '1'));
  await page.goto('/');
  await page.waitForTimeout(300);
});

test.describe('Portrait phone — maximize-by-default', () => {
  // AE1: opening Napster on a portrait phone yields a maximized window that
  // fills the viewport width and the height above the taskbar; tapping restore
  // returns it to a clamped floating window that sits fully on-screen.
  test('scenario 1: Napster opens maximized, restore yields an on-screen floating window', async ({ page }) => {
    await page.evaluate(() => { window.location.hash = '#window-napster'; });
    const napster = page.locator('#window-napster');
    await expect(napster).toHaveAttribute('data-state', 'maximized');

    const vp = page.viewportSize();
    const tb = await page.locator('#taskbar').boundingBox();
    const maxBox = await napster.boundingBox();
    expect(maxBox).not.toBeNull();
    // Flush to the top-left, full width, filling the height above the taskbar.
    // (The maximized rule reserves --taskbar-min-height, which can differ from
    // the rendered taskbar height by a couple px, so bound against the viewport
    // and require it to fill the space rather than pin the exact taskbar top.)
    expect(maxBox.x).toBeLessThanOrEqual(1);
    expect(maxBox.y).toBeLessThanOrEqual(1);
    expect(maxBox.width).toBeGreaterThanOrEqual(vp.width - 2);
    const maxBottom = maxBox.y + maxBox.height;
    expect(maxBottom).toBeLessThanOrEqual(vp.height + 1); // never past the viewport
    expect(maxBox.height).toBeGreaterThanOrEqual(vp.height - tb.height - 8); // fills the space

    // Restore (the maximize/restore control) → clamped floating window.
    await napster.locator('[aria-label="Maximize"]').tap();
    await expect(napster).toHaveAttribute('data-state', 'open');
    const box = await napster.boundingBox();
    // Floating: no longer filling the full height above the taskbar.
    expect(box.height).toBeLessThan(vp.height - tb.height);
    // On-screen: top-left corner in the viewport, title bar grabbable (>=44px
    // visible — the clampWindowToViewport / recoverWindowIfOffScreen contract).
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    const bar = await napster.locator('.title-bar').boundingBox();
    const visibleW = Math.min(bar.x + bar.width, vp.width) - Math.max(bar.x, 0);
    expect(visibleW).toBeGreaterThanOrEqual(44);
  });

  // Fixed-size dialog: Calculator keeps its ~240px native width, opens
  // horizontally centered, and stays in the plain 'open' state.
  test('scenario 2: Calculator opens native-size and centered, not maximized', async ({ page }) => {
    await page.evaluate(() => { window.location.hash = '#window-calculator'; });
    const calc = page.locator('#window-calculator');
    await expect(calc).toHaveAttribute('data-state', 'open');

    const vp = page.viewportSize();
    const box = await calc.boundingBox();
    expect(box).not.toBeNull();
    // Native size — well under the full-width a maximized window would take.
    expect(box.width).toBeLessThan(300);
    expect(box.width).toBeGreaterThan(200);
    // Horizontally centered: equal gutters left and right.
    const leftGap = box.x;
    const rightGap = vp.width - (box.x + box.width);
    expect(Math.abs(leftGap - rightGap)).toBeLessThanOrEqual(4);
  });

  // Rotate while maximized, then restore — the restore target must land
  // on-screen (the onViewportChange prevRect rewrite). Seed an off-screen
  // prevRect first so the rewrite has genuine work to do.
  test('scenario 3: rotate while maximized then restore lands on-screen', async ({ page }) => {
    await page.evaluate(() => { window.location.hash = '#window-about'; });
    const about = page.locator('#window-about');
    await expect(about).toHaveAttribute('data-state', 'maximized');

    // Restore, shove the floating window off the right edge, re-maximize so
    // the prevRect snapshot is genuinely off-screen.
    await about.locator('[aria-label="Maximize"]').tap();
    await expect(about).toHaveAttribute('data-state', 'open');
    await page.evaluate(() => {
      const el = document.getElementById('window-about');
      el.style.left = (window.innerWidth - 60) + 'px';
      el.style.top = '20px';
    });
    await about.locator('[aria-label="Maximize"]').tap();
    await expect(about).toHaveAttribute('data-state', 'maximized');

    const portrait = page.viewportSize();
    await page.setViewportSize({ width: portrait.height, height: portrait.width });
    await page.evaluate(() => {
      window.dispatchEvent(new Event('orientationchange'));
      window.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(200);

    await about.locator('[aria-label="Maximize"]').tap();
    await expect(about).toHaveAttribute('data-state', 'open');

    const vw = portrait.height, vh = portrait.width;
    const bar = await about.locator('.title-bar').boundingBox();
    expect(bar).not.toBeNull();
    const visibleW = Math.min(bar.x + bar.width, vw) - Math.max(bar.x, 0);
    expect(visibleW).toBeGreaterThanOrEqual(44);
    expect(bar.y).toBeGreaterThanOrEqual(0);
    expect(bar.y).toBeLessThanOrEqual(vh - 12);
  });

  // Deep-link entry path maximizes too (not only icon/menu taps).
  test('scenario 4: deep-link #window-about opens maximized on portrait', async ({ page }) => {
    await page.evaluate(() => { window.location.hash = '#window-about'; });
    await expect(page.locator('#window-about')).toHaveAttribute('data-state', 'maximized');
  });

  // Landscape phone (480-767px): maximize-by-default must NOT fire — the
  // window opens as a normal floating 'open' window. Touch/hover emulation
  // from the device persists across setViewportSize; only the width changes,
  // so isPortraitPhone() (max-width 479) goes false while isMobile() stays on.
  test('scenario 5: landscape phone (700px) opens About floating, not maximized', async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 390 });
    await page.evaluate(() => {
      window.dispatchEvent(new Event('orientationchange'));
      window.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(150);

    await page.evaluate(() => { window.location.hash = '#window-about'; });
    await expect(page.locator('#window-about')).toHaveAttribute('data-state', 'open');
  });
});
