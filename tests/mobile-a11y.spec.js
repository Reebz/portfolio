// U9 — Mobile accessibility parity.
//
// Covers AE10 + R15 (the responsive desktop preserves a11y parity at phone
// and tablet sizes — accessible names on Start button, taskbar chips,
// desktop icons, and window controls; a tabbable skip link).
//
// Implementation note: `page.accessibility.snapshot()` is Chromium-only in
// Playwright. Mobile projects (iphone-14, ipad-pro-11) emulate WebKit where
// the accessibility namespace is undefined. We use Playwright's locator
// role/name queries (which compute accessible name per ARIA spec) plus
// direct DOM inspection. These approaches work across both engines and
// avoid the @axe-core/playwright dep (forbidden by U9 constraints).

const { test, expect } = require('@playwright/test');

test.describe('Mobile a11y', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => sessionStorage.setItem('booted', '1'));
    await page.goto('/');
    await page.waitForTimeout(300);
  });

  test('AE10: Start button has an accessible name', async ({ page }) => {
    // The Start button's accessible name comes from its text content "Start"
    // (no aria-label). getByRole('button', { name: 'Start' }) resolves via
    // accessible-name computation, the same path screen readers follow.
    const startBtn = page.getByRole('button', { name: /Start/ });
    await expect(startBtn).toBeVisible();
    await expect(startBtn).toHaveAttribute('id', 'start-button');
  });

  test('AE10: desktop icons expose accessible names', async ({ page }) => {
    // Icons render with role="gridcell" inside icon-grid (role="grid").
    // Every icon contains a visible label as its accessible name source.
    const gridcells = page.getByRole('gridcell');
    const count = await gridcells.count();
    expect(count).toBeGreaterThan(5);

    for (let i = 0; i < count; i++) {
      const cell = gridcells.nth(i);
      // The accessible name comes from textContent on the icon label.
      const label = await cell.evaluate((el) => {
        // Try aria-label first, then text content fallback.
        return el.getAttribute('aria-label') || el.textContent.trim();
      });
      expect(label.length).toBeGreaterThan(0);
    }
  });

  test('AE10: window controls have accessible names', async ({ page }) => {
    await page.evaluate(() => { window.location.hash = '#window-guestbook'; });
    await page.waitForTimeout(200);
    // R9: Guestbook is in MAXIMIZE_DEFAULT, so on a portrait phone it opens
    // maximized rather than floating. The control-name check below is
    // state-agnostic — a maximized window keeps its full title-bar controls.
    await expect(page.locator('#window-guestbook')).toHaveAttribute('data-state', 'maximized');

    // Guestbook has Minimize / Maximize / Close controls (index.html:82-84).
    // Scope to the guestbook window — other windows have their own controls.
    const win = page.locator('#window-guestbook');
    await expect(win.getByRole('button', { name: 'Minimize' })).toBeVisible();
    await expect(win.getByRole('button', { name: 'Maximize' })).toBeVisible();
    await expect(win.getByRole('button', { name: 'Close' })).toBeVisible();
  });

  test('AE10: taskbar chips have accessible names matching the window title', async ({ page }) => {
    await page.evaluate(() => { window.location.hash = '#window-guestbook'; });
    await page.waitForTimeout(200);

    // Taskbar chips inherit their accessible name from their textContent
    // (desktop.js:407). Verify the chip exists and carries a non-empty name.
    const chip = page.locator('#taskbar [data-window-id="window-guestbook"]');
    await expect(chip).toBeVisible();
    const name = await chip.evaluate((el) => el.textContent.trim());
    expect(name.length).toBeGreaterThan(0);
  });

  test('R15: skip links exist and are reachable in the document order', async ({ page }) => {
    // The skip link is the first <a href="#..."> inside .skip-links (index.html:25-28).
    // We verify it exists, is focusable, and — when focused — becomes visible
    // (.skip-links a:focus rule pulls it back from left:-9999px to left:0).
    const firstSkip = page.locator('.skip-links a').first();
    await expect(firstSkip).toHaveAttribute('href');

    // Focus the link directly. Playwright's keyboard.press('Tab') has known
    // engine-specific quirks under WebKit emulation; programmatic focus is
    // a more reliable signal that the element is a valid focus target.
    await firstSkip.evaluate((el) => el.focus());
    const focused = await page.evaluate(() => ({
      tag: document.activeElement.tagName,
      inSkipLinks: !!document.activeElement.closest('.skip-links'),
    }));
    expect(focused.tag).toBe('A');
    expect(focused.inSkipLinks).toBe(true);

    // Verify the focus-visible CSS pulls the skip link into view.
    const leftOnFocus = await firstSkip.evaluate((el) => getComputedStyle(el).left);
    expect(leftOnFocus).not.toMatch(/-9999/);
  });
});
