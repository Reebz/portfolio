// B7 — Quick Launch hidden on mobile.
//
// The Show Desktop / Outlook / My Computer shortcuts in #quick-launch consume
// scarce horizontal taskbar room on phones. The three mobile @media blocks in
// style.css set `#quick-launch { display: none }` so the chip container can
// reclaim that space via flex: 1.
//
// Runs under the iphone-14 and ipad-pro-11 projects in playwright.config.js.

const { test, expect } = require('@playwright/test');

test('quick-launch is hidden on mobile', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#taskbar');
  const display = await page.locator('#quick-launch').evaluate(el => getComputedStyle(el).display);
  expect(display).toBe('none');
});

test('taskbar still has start button + chip container + tray', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeVisible();
  // #taskbar-buttons is empty at cold load (no windows open) so toBeVisible()
  // would fail on its 0-height bounding box. Assert it's attached and not
  // display:none instead — the chip container reclaims width via flex: 1.
  await expect(page.locator('#taskbar-buttons')).toBeAttached();
  const chipDisplay = await page.locator('#taskbar-buttons').evaluate(el => getComputedStyle(el).display);
  expect(chipDisplay).not.toBe('none');
  await expect(page.locator('#system-tray')).toBeVisible();
});
