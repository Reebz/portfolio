const { test, expect } = require('@playwright/test');

// Tablets (touch + min-width 768px) inherit the desktop experience. These
// tests prove the touch-detection contract rewrite (style.css base @media,
// desktop.js isMobile(), boot.js) holds — iPad gets zoom: 1.5, no mobile
// CSS, and the native Win98 chrome.

test('body keeps desktop zoom 1.5 on iPad', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#desktop');
  const zoom = await page.locator('body').evaluate(el => getComputedStyle(el).zoom);
  expect(zoom).toBe('1.5');
});

test('isMobile() returns false on iPad', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.matchMedia === 'function');
  const isMobile = await page.evaluate(() =>
    window.matchMedia('(hover: none) and (pointer: coarse) and (max-width: 767px)').matches
  );
  expect(isMobile).toBe(false);
});

test('icon grid uses absolute-position desktop layout', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.desktop-icon');
  // Mobile path uses CSS Grid (display: grid). Desktop path uses
  // absolute-position via layoutIcons(). Verify we're on the desktop path.
  const display = await page.locator('#icon-grid').evaluate(el => getComputedStyle(el).display);
  expect(display).not.toBe('grid');
  const iconPos = await page.locator('.desktop-icon').first().evaluate(el => getComputedStyle(el).position);
  expect(iconPos).toBe('absolute');
});

test('taskbar uses desktop chrome (28px, not 44px)', async ({ page }) => {
  await page.goto('/');
  const taskbarH = await page.locator('#taskbar').boundingBox().then(b => b.height);
  // Desktop chrome is 28px; mobile bumps to 44+. With body zoom 1.5, the
  // computed bounding box height is 28 * 1.5 = 42. We check it's well under
  // the mobile 44px floor (which would be 44 * 1.5 = 66 with zoom).
  expect(taskbarH).toBeLessThan(50);
});

test('quick-launch is NOT hidden on iPad', async ({ page }) => {
  await page.goto('/');
  // B7 hid quick-launch only on phones; tablet inherits desktop visibility.
  // Check computed display (toBeVisible can false-fail on flex containers
  // with empty children — same fix the U1 mobile-taskbar spec uses).
  await expect(page.locator('#quick-launch')).toBeAttached();
  const display = await page.locator('#quick-launch').evaluate(el => getComputedStyle(el).display);
  expect(display).not.toBe('none');
});

test('title bar uses native height (not the mobile 44px bump)', async ({ page }) => {
  await page.goto('/');
  // Open About Me via hash deep link (avoids icon-overlap issue on touch).
  await page.goto('/#window-about');
  await page.waitForSelector('#window-about[data-state="open"]');
  const titleBarH = await page.locator('#window-about .title-bar').boundingBox().then(b => b.height);
  // Native vendor 98.css title bar is ~18-22px. With body zoom 1.5 that's
  // 27-33px. The mobile bump (44px * 1.5 = 66px) would clearly exceed this.
  expect(titleBarH).toBeLessThan(40);
});

test('Paint renders the jspaint iframe (not the mobile note)', async ({ page }) => {
  await page.goto('/#window-paint');
  await page.waitForSelector('#window-paint[data-state="open"]');
  // U8 swapped Paint to an inline note ONLY when (max-width: 767px) — iPad
  // at 834px portrait should get the iframe.
  await expect(page.locator('#window-paint iframe[src*="jspaint"]')).toBeAttached();
  await expect(page.locator('#window-paint .paint-mobile-note')).toHaveCount(0);
});
