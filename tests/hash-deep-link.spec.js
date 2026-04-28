const { test, expect } = require('@playwright/test');

test.describe('U3 — hash deep-link to dynamic windows', () => {
  test('opens window-paint when navigating to /#window-paint cold', async ({ page }) => {
    // No sessionStorage.booted — boot.js skips boot anyway because location.hash is set.
    await page.goto('/#window-paint');
    // Wait for desktop init to run and for applyHashState to register the launchable window.
    await expect(page.locator('#window-paint')).toHaveAttribute('data-state', 'open', { timeout: 5000 });
  });

  test('opens window-calculator when navigating to /#window-calculator cold', async ({ page }) => {
    await page.goto('/#window-calculator');
    await expect(page.locator('#window-calculator')).toHaveAttribute('data-state', 'open', { timeout: 5000 });
  });

  test('opens window-napster when navigating to /#window-napster cold', async ({ page }) => {
    await page.goto('/#window-napster');
    await expect(page.locator('#window-napster')).toHaveAttribute('data-state', 'open', { timeout: 5000 });
  });

  test('still opens static system windows from a hash deep link', async ({ page }) => {
    await page.goto('/#window-guestbook');
    await expect(page.locator('#window-guestbook')).toHaveAttribute('data-state', 'open', { timeout: 5000 });
  });

  test('unknown hashes do not throw and do not open anything', async ({ page }) => {
    await page.goto('/#window-bogus');
    // Wait long enough for any router activity to settle.
    await page.waitForTimeout(500);
    const openCount = await page.locator('.window[data-state="open"]').count();
    expect(openCount).toBe(0);
  });
});
