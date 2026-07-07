// U3 (test-coverage plan) — Anti-scroll on the page itself.
//
// Defends against B4 (desktop pan/scroll on mobile). The mobile @media blocks
// lock html/body to `height: 100%; overflow: hidden;` so the page never
// scrolls — Win98 chrome is supposed to feel like a fixed-frame OS, not a
// scrolling document. This spec exercises that lock from multiple angles:
//
//   - cold load: window.scrollY === 0 with nothing open
//   - mouse-wheel after cold load: scrollY stays 0
//   - mouse-wheel after 3 windows are open: scrollY stays 0
//   - touch-drag synth: page does not scroll (vertical swipe over the desktop)
//
// Page-scroll vs. container-scroll: container scroll (e.g. inside
// .start-menu-items or #taskbar-buttons) is correct and desired. We assert
// only on window.scrollY so legitimate inner scrollers are not flagged.

const { test, expect } = require('@playwright/test');

test.describe('Mobile — page never scrolls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => sessionStorage.setItem('booted', '1'));
    await page.goto('/');
    await page.waitForTimeout(300);
  });

  test('R4: window.scrollY is 0 after cold load', async ({ page }) => {
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBe(0);
  });

  test('R4: html/body overflow is locked so the page cannot scroll on cold load', async ({ page }) => {
    // Mobile WebKit doesn't expose mouse.wheel (Playwright limitation —
    // touch-only emulation), so we exercise the contract directly: the mobile
    // @media block sets html, body { height: 100%; overflow: hidden }. With
    // overflow hidden, programmatic scrollTo cannot move scrollY off zero,
    // and that's the structural lock that defends against B4. We assert both
    // the computed style and the post-scrollTo position.
    const overflow = await page.evaluate(() => ({
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
      bodyOverflow: getComputedStyle(document.body).overflow,
    }));
    expect(overflow.htmlOverflow).toBe('hidden');
    expect(overflow.bodyOverflow).toBe('hidden');

    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(50);
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBe(0);
  });

  test('R4: page does not scroll after opening 3 windows via hash deep links', async ({ page }) => {
    // Three hash deep links — `applyHashState` debounces by 100ms so we wait
    // 200ms between each to ensure all three windows enter the open state.
    await page.evaluate(() => { window.location.hash = '#window-about'; });
    await page.waitForTimeout(200);
    await page.evaluate(() => { window.location.hash = '#window-calculator'; });
    await page.waitForTimeout(200);
    await page.evaluate(() => { window.location.hash = '#window-paint'; });
    await page.waitForTimeout(300);

    // R9: About and Paint are in MAXIMIZE_DEFAULT (open maximized on a portrait
    // phone); Calculator is a fixed-size dialog and stays a centered 'open'
    // window. The anti-scroll contract is a page-level property, independent of
    // each window's state — three open windows still must not scroll the page.
    await expect(page.locator('#window-about')).toHaveAttribute('data-state', 'maximized');
    await expect(page.locator('#window-calculator')).toHaveAttribute('data-state', 'open');
    await expect(page.locator('#window-paint')).toHaveAttribute('data-state', 'maximized');

    // Same structural exercise as the cold-load case — overflow contract +
    // programmatic scroll attempt. Mouse wheel isn't available on mobile
    // WebKit so we cannot synthesize a real "user wants to scroll" event,
    // but the overflow lock is the actual defense.
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(50);
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBe(0);
  });

  test('R4: vertical touch-drag over the desktop does not scroll the page', async ({ page }) => {
    // page.touchscreen.tap() is the only touch primitive Playwright exposes
    // — for sustained drags we synthesize via the pointer pipeline (mouse
    // events that go through the same pointerdown/pointermove/pointerup
    // handlers as touch on iOS Safari). The desktop drag-band wires through
    // #desktop and is suppressed by touch-action: none, so this exercises
    // the same code path real-touch would.
    const vp = page.viewportSize();
    const startX = vp.width / 2;
    const startY = vp.height * 0.6; // below the icon grid, above the taskbar
    const endY = vp.height * 0.2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX, endY, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(150);

    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBe(0);
  });
});
