const { test, expect } = require('@playwright/test');
const { mockGoatCounter } = require('./_helpers');

// Stub gc.zgo.at / goatcounter.com before any spec touches the page so CI
// never makes real analytics requests. See tests/_helpers.js for context.
test.beforeEach(async ({ page }) => {
  await mockGoatCounter(page);
});

test.describe('Boot skip paths', () => {
  test('skips boot when sessionStorage.booted is set', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => sessionStorage.setItem('booted', '1'));
    await page.goto('/');
    await page.waitForTimeout(300);
    await expect(page.locator('#boot-overlay')).toHaveCount(0);
  });

  test('skips boot when navigated with a hash', async ({ page }) => {
    await page.goto('/#window-about');
    await page.waitForTimeout(300);
    await expect(page.locator('#boot-overlay')).toHaveCount(0);
  });

  test('skips boot when prefers-reduced-motion is set', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    // These tests spin up their own context, bypassing the file-level
    // beforeEach — mock GoatCounter on the new page so CI stays clean.
    await mockGoatCounter(page);
    await page.goto('/');
    await page.waitForTimeout(300);
    await expect(page.locator('#boot-overlay')).toHaveCount(0);
    await context.close();
  });

  test('skips boot on coarse-pointer touch device emulation', async ({ browser }) => {
    const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 667 } });
    const page = await context.newPage();
    await mockGoatCounter(page);
    await page.goto('/');
    await page.waitForTimeout(300);
    await expect(page.locator('#boot-overlay')).toHaveCount(0);
    await context.close();
  });

  test('click skip removes the boot overlay', async ({ page }) => {
    await page.goto('/');
    // Wait for the overlay to render
    await expect(page.locator('#boot-overlay')).toBeVisible({ timeout: 3000 });
    await page.click('#boot-overlay');
    await page.waitForTimeout(700);
    await expect(page.locator('#boot-overlay')).toHaveCount(0);
    const booted = await page.evaluate(() => sessionStorage.getItem('booted'));
    expect(booted).toBe('1');
  });

  test('keypress skip removes the boot overlay', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#boot-overlay')).toBeVisible({ timeout: 3000 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(700);
    await expect(page.locator('#boot-overlay')).toHaveCount(0);
  });
});
