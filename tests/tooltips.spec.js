// U7 / R4 — Win98 hover tooltips (desktop pointer hover only).
//
// One reusable #win98-tooltip element shows a pale-yellow Win98 tooltip
// after the ~500ms delay when hovering the tray clock, and hides on
// pointer-leave. The tray clock shows the full weekday date sourced from
// the same en-AU formatter the Date/Time window uses.
//
// Non-mobile-prefixed filename, so this runs under the desktop project only
// (see playwright.config.js testMatch). The hover:none guard for phones is
// covered by mobile-tooltips.spec.js.

const { test, expect } = require('@playwright/test');
const { mockGoatCounter } = require('./_helpers');

test.beforeEach(async ({ page }) => {
  await mockGoatCounter(page);
  await page.goto('/');
  await page.evaluate(() => sessionStorage.setItem('booted', '1'));
  await page.goto('/');
  await page.waitForTimeout(300);
});

test.describe('Win98 tooltips (desktop hover)', () => {
  test('tray clock hover shows the tooltip with today\'s full date, then hides', async ({ page }) => {
    const tooltip = page.locator('#win98-tooltip');
    await expect(tooltip).toBeHidden();

    await page.locator('#clock').hover();
    await expect(tooltip).toBeVisible({ timeout: 2000 });

    // Same full weekday date the Date/Time window renders (en-AU long date).
    const expected = await page.evaluate(() =>
      new Date().toLocaleDateString('en-AU', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      })
    );
    await expect(tooltip).toHaveText(expected);

    // Moving the pointer away hides it.
    await page.mouse.move(4, 4);
    await expect(tooltip).toBeHidden();
  });

  test('tooltip styling is pale yellow, 1px black border, 11px text', async ({ page }) => {
    await page.locator('#clock').hover();
    await expect(page.locator('#win98-tooltip')).toBeVisible({ timeout: 2000 });

    const s = await page.locator('#win98-tooltip').evaluate((el) => {
      const cs = getComputedStyle(el);
      // Under body zoom, getComputedStyle reports border width in the zoomed
      // space; multiply back by zoom to recover the authored CSS px.
      const zoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
      return {
        bg: cs.backgroundColor,
        borderCssPx: Math.round(parseFloat(cs.borderTopWidth) * zoom),
        borderStyle: cs.borderTopStyle,
        borderColor: cs.borderTopColor,
        fontSize: cs.fontSize,
      };
    });
    expect(s.bg).toBe('rgb(255, 255, 225)'); // #ffffe1
    expect(s.borderCssPx).toBe(1);
    expect(s.borderStyle).toBe('solid');
    expect(s.borderColor).toBe('rgb(0, 0, 0)');
    expect(s.fontSize).toBe('11px');
  });

  test('quick-launch button hover shows its label as a tooltip', async ({ page }) => {
    const tooltip = page.locator('#win98-tooltip');
    await page.locator('.quick-launch-btn[data-window="window-contact"]').hover();
    await expect(tooltip).toBeVisible({ timeout: 2000 });
    await expect(tooltip).toHaveText('Outlook Express');
  });

  test('title-bar control button hover shows its aria-label as a tooltip', async ({ page }) => {
    await page.evaluate(() => { window.location.hash = '#window-about'; });
    await expect(page.locator('#window-about')).toHaveAttribute('data-state', 'open');

    const tooltip = page.locator('#win98-tooltip');
    await page.locator('#window-about [aria-label="Close"]').hover();
    await expect(tooltip).toBeVisible({ timeout: 2000 });
    await expect(tooltip).toHaveText('Close');
  });
});
