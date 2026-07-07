// U7 / R4 — Tooltip hover guard on touch devices.
//
// The Win98 tooltip binds pointer listeners only when
// matchMedia('(hover: hover)') matches, so on phones (hover: none) no
// listeners exist and hovering / pointer-over the tray clock must never
// reveal #win98-tooltip. Runs under the phone projects (mobile-* filename).

const { test, expect } = require('@playwright/test');
const { mockGoatCounter } = require('./_helpers');

test.beforeEach(async ({ page }) => {
  await mockGoatCounter(page);
  await page.goto('/');
  await page.evaluate(() => sessionStorage.setItem('booted', '1'));
  await page.goto('/');
  await page.waitForTimeout(300);
});

test.describe('Win98 tooltips (touch guard)', () => {
  test('hover: none — pointer-over the clock never reveals the tooltip', async ({ page }) => {
    // This project must report no hover capability, otherwise the guard
    // premise is wrong.
    const hoverNone = await page.evaluate(
      () => window.matchMedia('(hover: none)').matches
    );
    expect(hoverNone).toBe(true);

    const tooltip = page.locator('#win98-tooltip');
    await expect(tooltip).toBeHidden();

    // A bound listener would fire on this exact event; with the guard active
    // no listener exists, so the tooltip stays hidden past the show delay.
    await page.locator('#clock').dispatchEvent('pointerover');
    await page.waitForTimeout(700);
    await expect(tooltip).toBeHidden();
  });
});
