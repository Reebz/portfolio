// U3 (test-coverage plan) — Taskbar horizontal-space audit.
//
// Defends against B7 (quick-launch consumed scarce horizontal taskbar room,
// crowding out window chips) by auditing taskbar layout at 0, 1, 3, and 6
// open windows. The B7 design is:
//
//   - #quick-launch hidden on phones (so chips have room)
//   - #start-button + #system-tray pinned at the edges
//   - #taskbar-buttons grows via flex: 1 and horizontal-scrolls when chips
//     overflow (overflow-x: auto + scrollbar hidden) — preserves Win98 feel
//     of "more windows than fit" without truncating chips
//
// Tests open windows via hash deep links (existing pattern from
// mobile-multi-window.spec.js) — that path covers cavaro, paint, calculator,
// minesweeper, napster, icq via the launchable-window-map registry.
//
// Per R1 we use real .tap() — no dispatchEvent.

const { test, expect } = require('@playwright/test');

// All windows we open by hash to reach 6-chip stress. Six is intentional —
// it forces overflow on every phone viewport (375/390/430 wide) since each
// chip has a 44-88px min-width per the mobile @media block.
const SIX_WINDOWS = [
  '#window-about',
  '#window-calculator',
  '#window-paint',
  '#window-minesweeper',
  '#window-napster',
  '#window-icq',
];

async function openWindowsViaHash(page, hashes) {
  for (const h of hashes) {
    await page.evaluate((hh) => { window.location.hash = hh; }, h);
    // applyHashState debounces by 100ms; 200ms keeps each open before the next
    // hashchange overrides debounce.
    await page.waitForTimeout(200);
  }
  // Final settle so all chips have been injected into #taskbar-buttons.
  await page.waitForTimeout(150);
}

test.describe('Mobile — taskbar layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => sessionStorage.setItem('booted', '1'));
    await page.goto('/');
    await page.waitForTimeout(300);
  });

  test('R6 / B7 guard: #quick-launch is hidden (display: none) on phones', async ({ page }) => {
    const display = await page.locator('#quick-launch').evaluate(
      (el) => getComputedStyle(el).display
    );
    expect(display).toBe('none');
  });

  test('R6: with 0 windows, Start + tray fit and chip container is empty-but-present', async ({ page }) => {
    await expect(page.locator('#start-button')).toBeVisible();
    await expect(page.locator('#system-tray')).toBeVisible();

    // #taskbar-buttons has 0 chips so its rendered box has 0 width — assert
    // attached + not display:none (the U7 / B7 pattern from
    // mobile-taskbar-no-quick-launch.spec.js).
    await expect(page.locator('#taskbar-buttons')).toBeAttached();
    const chipDisplay = await page.locator('#taskbar-buttons').evaluate(
      (el) => getComputedStyle(el).display
    );
    expect(chipDisplay).not.toBe('none');
    const chipCount = await page.locator('#taskbar-buttons .taskbar-window-btn').count();
    expect(chipCount).toBe(0);

    // Edge audit: start-button + system-tray sit inside the taskbar.
    const taskbar = await page.locator('#taskbar').boundingBox();
    const startBox = await page.locator('#start-button').boundingBox();
    const trayBox = await page.locator('#system-tray').boundingBox();
    expect(startBox.x).toBeGreaterThanOrEqual(taskbar.x - 1);
    expect(startBox.x + startBox.width).toBeLessThanOrEqual(taskbar.x + taskbar.width + 1);
    expect(trayBox.x + trayBox.width).toBeLessThanOrEqual(taskbar.x + taskbar.width + 1);
  });

  test('R6: with 1 window open, chip fits and all taskbar children sit within the taskbar', async ({ page }) => {
    await openWindowsViaHash(page, ['#window-about']);
    // R9: About opens maximized on a portrait phone. The taskbar-layout proof
    // (one chip present, all taskbar children inside the taskbar box) is about
    // the chip, not the window's own geometry — a maximized window still owns
    // exactly one taskbar chip.
    await expect(page.locator('#window-about')).toHaveAttribute('data-state', 'maximized');

    const chipCount = await page.locator('#taskbar-buttons .taskbar-window-btn').count();
    expect(chipCount).toBe(1);

    // Every child of #taskbar's *visible* layout (start, chip container, tray)
    // sits inside the taskbar's box horizontally. Visually-hidden children
    // (#quick-launch display:none) are skipped — their boundingBox is null.
    const taskbar = await page.locator('#taskbar').boundingBox();
    const childRects = await page.locator('#taskbar > *').evaluateAll((els) =>
      els.map((el) => {
        const cs = getComputedStyle(el);
        if (cs.display === 'none') return null;
        const r = el.getBoundingClientRect();
        return { id: el.id || el.className, left: r.left, right: r.right };
      })
    );
    childRects.filter((r) => r !== null).forEach((r) => {
      expect(r.right).toBeLessThanOrEqual(taskbar.x + taskbar.width + 1);
      expect(r.left).toBeGreaterThanOrEqual(taskbar.x - 1);
    });
  });

  test('R6: with 3 windows open, chips fit or horizontal-scroll without breaking taskbar edges', async ({ page }) => {
    await openWindowsViaHash(page, ['#window-about', '#window-calculator', '#window-paint']);

    const chipCount = await page.locator('#taskbar-buttons .taskbar-window-btn').count();
    expect(chipCount).toBe(3);

    const taskbar = await page.locator('#taskbar').boundingBox();
    const trayBox = await page.locator('#system-tray').boundingBox();
    const chipContainer = await page.locator('#taskbar-buttons').evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));

    // System tray stays visible at the right edge regardless of chip count
    // — flex-shrink: 0 keeps it pinned.
    expect(trayBox.x + trayBox.width).toBeLessThanOrEqual(taskbar.x + taskbar.width + 1);
    expect(trayBox.x + trayBox.width).toBeGreaterThan(taskbar.x + taskbar.width - 60); // right-pinned (within 60px of edge)

    // Either chips fit (scrollWidth <= clientWidth + tolerance) OR the chip
    // container is set up to horizontal-scroll (overflow-x: auto). The latter
    // is the B7 design when chips overflow.
    const overflowX = await page.locator('#taskbar-buttons').evaluate(
      (el) => getComputedStyle(el).overflowX
    );
    const fits = chipContainer.scrollWidth <= chipContainer.clientWidth + 1;
    expect(fits || overflowX === 'auto' || overflowX === 'scroll').toBe(true);
  });

  test('R6: stress — 6 open windows force horizontal-scroll on chips, system tray still pinned right', async ({ page }) => {
    await openWindowsViaHash(page, SIX_WINDOWS);

    const chipCount = await page.locator('#taskbar-buttons .taskbar-window-btn').count();
    expect(chipCount).toBe(6);

    const taskbar = await page.locator('#taskbar').boundingBox();
    const trayBox = await page.locator('#system-tray').boundingBox();
    const startBox = await page.locator('#start-button').boundingBox();
    const chipContainer = await page.locator('#taskbar-buttons').evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));

    // Start button still rooted at the left edge.
    expect(startBox.x).toBeGreaterThanOrEqual(taskbar.x - 1);
    expect(startBox.x).toBeLessThan(taskbar.x + 8);

    // System tray still pinned to the right edge (within 60px of taskbar right).
    expect(trayBox.x + trayBox.width).toBeLessThanOrEqual(taskbar.x + taskbar.width + 1);
    expect(trayBox.x + trayBox.width).toBeGreaterThan(taskbar.x + taskbar.width - 60);

    // 6 chips of ~88-120px min-width exceed every phone viewport's available
    // chip area (after Start ~64px + tray ~120px). Chips MUST overflow and
    // the container MUST be set up to scroll. If this assertion ever fires,
    // either chip min-width shrank or the overflow-x rule was deleted.
    expect(chipContainer.scrollWidth).toBeGreaterThan(chipContainer.clientWidth);

    const overflowX = await page.locator('#taskbar-buttons').evaluate(
      (el) => getComputedStyle(el).overflowX
    );
    expect(['auto', 'scroll']).toContain(overflowX);
  });
});
