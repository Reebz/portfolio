// U7 / R4 — Win98 hover tooltips (desktop pointer hover only).
//
// One reusable #win98-tooltip element shows a pale-yellow Win98 tooltip
// after the ~500ms delay when hovering the tray clock, and hides on
// pointer-leave. The tray clock shows the full weekday date sourced from
// the same en-AU formatter the Date/Time window uses.
//
// Project desktop icons show their description the same way, and system
// icons show none. A press or drag keeps the icon's tooltip away until the
// pointer leaves it, and icons show none while a context menu is open.
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

  test('project icon hover shows its description just below the icon', async ({ page }) => {
    const tooltip = page.locator('#win98-tooltip');
    const icon = page.locator('.desktop-icon[data-window-id="window-always-draft"]');
    await icon.hover();
    await expect(tooltip).toBeVisible({ timeout: 2000 });
    await expect(tooltip).toHaveText('Blog');

    // Both boxes are viewport pixels, so this holds under body zoom 1.5.
    const iconBox = await icon.boundingBox();
    const tipBox = await tooltip.boundingBox();
    expect(Math.abs(tipBox.x - iconBox.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(tipBox.y - (iconBox.y + iconBox.height + 2))).toBeLessThanOrEqual(1);

    // Each project icon shows its own description.
    await page.locator('.desktop-icon[data-window-id="window-obsidian-game"]').hover();
    await expect(tooltip).toHaveText('Game project', { timeout: 2000 });

    await page.mouse.move(4, 4);
    await expect(tooltip).toBeHidden();
  });

  test('system desktop icons show no tooltip', async ({ page }) => {
    const tooltip = page.locator('#win98-tooltip');
    for (const id of ['my-computer', 'recycle-bin', 'about', 'guestbook', 'contact']) {
      await page.locator(`.desktop-icon[data-window-id="window-${id}"]`).hover();
      // Past the 500ms show delay and still nothing.
      await page.waitForTimeout(700);
      await expect(tooltip).toBeHidden();
    }
  });

  test('dragging a project icon never leaves its tooltip behind', async ({ page }) => {
    const tooltip = page.locator('#win98-tooltip');
    const icon = page.locator('.desktop-icon[data-window-id="window-claude-battery"]');
    const before = await icon.boundingBox();

    // Press on the label. The drag's pointer capture then re-fires
    // pointerover on the icon, which used to bring the tooltip back mid-drag
    // and leave it stranded at the old spot.
    const label = await icon.locator('.desktop-icon-label').boundingBox();
    const x = label.x + label.width / 2;
    const y = label.y + label.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 40, y + 10, { steps: 4 });
    await page.waitForTimeout(700);
    await expect(tooltip).toBeHidden();
    await page.mouse.move(x + 400, y + 40, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(700);
    await expect(tooltip).toBeHidden();

    // The icon really moved. After the pointer leaves and comes back, the
    // tooltip shows again under the icon's new spot.
    const after = await icon.boundingBox();
    expect(after.x).toBeGreaterThan(before.x + 300);
    await page.mouse.move(4, 4);
    await icon.hover();
    await expect(tooltip).toHaveText('AI tool', { timeout: 2000 });
    const tipBox = await tooltip.boundingBox();
    expect(Math.abs(tipBox.x - after.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(tipBox.y - (after.y + after.height + 2))).toBeLessThanOrEqual(1);
  });

  test('double-clicking a project icon leaves no tooltip behind', async ({ page }) => {
    // Stub window.open so the link icon opens without leaving the page.
    await page.evaluate(() => {
      window.__opened = [];
      window.open = function (url) { window.__opened.push(url); return null; };
    });

    const tooltip = page.locator('#win98-tooltip');
    const label = page.locator('.desktop-icon[data-window-id="window-avails-click"] .desktop-icon-label');
    await label.hover();
    await expect(tooltip).toBeVisible({ timeout: 2000 });
    await label.dblclick();
    await expect.poll(() => page.evaluate(() => window.__opened.length)).toBe(1);

    // The pointer is still on the icon, but the press keeps it quiet.
    await page.waitForTimeout(700);
    await expect(tooltip).toBeHidden();
  });

  test('project icons stay quiet while a context menu is open', async ({ page }) => {
    const tooltip = page.locator('#win98-tooltip');
    await page.click('#desktop', { button: 'right', position: { x: 700, y: 300 } });
    await expect(page.locator('#context-menu-desktop')).toHaveClass(/open/);
    await page.locator('.desktop-icon[data-window-id="window-always-draft"]').hover();
    await page.waitForTimeout(700);
    await expect(tooltip).toBeHidden();

    // Once the menu closes, icons show their tooltips again.
    await page.keyboard.press('Escape');
    await expect(page.locator('#context-menu-desktop')).not.toHaveClass(/open/);
    await page.locator('.desktop-icon[data-window-id="window-claude-battery"]').hover();
    await expect(tooltip).toHaveText('AI tool', { timeout: 2000 });
  });
});
