const { test, expect } = require('@playwright/test');

test.describe('U5 — Help book lazy load', () => {
  test('book.js is not requested on cold load', async ({ page }) => {
    let bookRequested = false;
    page.on('request', (req) => {
      if (req.url().includes('apps/help/book.js')) bookRequested = true;
    });
    await page.goto('/');
    await page.evaluate(() => sessionStorage.setItem('booted', '1'));
    await page.goto('/');
    await page.waitForTimeout(800);
    expect(bookRequested).toBe(false);
  });

  test('book.js loads exactly once on Help launch and the book renders', async ({ page }) => {
    let bookRequestCount = 0;
    page.on('request', (req) => {
      if (req.url().includes('apps/help/book.js')) bookRequestCount++;
    });
    await page.goto('/');
    await page.evaluate(() => sessionStorage.setItem('booted', '1'));
    await page.goto('/');
    await page.waitForTimeout(300);
    // Open Help book via hash deep-link (covered by U3's launchable hash map)
    await page.evaluate(() => { window.location.hash = '#window-help-book'; });
    await page.waitForTimeout(500);
    await expect(page.locator('#window-help-book')).toHaveAttribute('data-state', 'open');
    await expect(page.locator('#help-page')).toBeVisible();
    expect(bookRequestCount).toBe(1);
  });

  test('book.js loads only once across multiple open/close cycles', async ({ page }) => {
    let bookRequestCount = 0;
    page.on('request', (req) => {
      if (req.url().includes('apps/help/book.js')) bookRequestCount++;
    });
    await page.goto('/');
    await page.evaluate(() => sessionStorage.setItem('booted', '1'));
    await page.goto('/');
    await page.waitForTimeout(300);
    // Open then close 3 times
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => { window.location.hash = '#window-help-book'; });
      await page.waitForTimeout(300);
      await page.click('#window-help-book .title-bar [aria-label="Close"]');
      await page.waitForTimeout(150);
      await page.evaluate(() => { window.location.hash = ''; });
      await page.waitForTimeout(150);
    }
    expect(bookRequestCount).toBe(1);
  });
});
