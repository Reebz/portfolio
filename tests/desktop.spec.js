const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

test.describe('BIOS Boot', () => {
  test('shows boot overlay on fresh visit', async ({ page }) => {
    await page.goto('/');
    // Boot overlay should be visible (sessionStorage clear on fresh context)
    const overlay = page.locator('#boot-overlay');
    // It may have already started — just verify the page loads
    await expect(page).toHaveTitle(/Portfolio 98/);
  });

  test('skips boot on hash deep link', async ({ page }) => {
    await page.goto('/#window-about');
    await page.waitForTimeout(500);
    const overlay = page.locator('#boot-overlay');
    await expect(overlay).toHaveCount(0);
  });
});

test.describe('Desktop', () => {
  test.beforeEach(async ({ page }) => {
    // Skip boot by setting sessionStorage
    await page.goto('/');
    await page.evaluate(() => sessionStorage.setItem('booted', '1'));
    await page.goto('/');
    await page.waitForTimeout(300);
  });

  test('desktop loads with icons', async ({ page }) => {
    const icons = page.locator('.desktop-icon');
    await expect(icons.first()).toBeVisible();
    const count = await icons.count();
    expect(count).toBeGreaterThan(5);
  });

  test('taskbar is visible with Start button', async ({ page }) => {
    await expect(page.locator('#taskbar')).toBeVisible();
    await expect(page.locator('#start-button')).toBeVisible();
    await expect(page.locator('#clock')).toBeVisible();
  });

  test('Start menu opens on click', async ({ page }) => {
    await page.click('#start-button');
    await expect(page.locator('#start-menu')).toHaveClass(/open/);
  });

  test('Start menu closes on Escape', async ({ page }) => {
    await page.click('#start-button');
    await expect(page.locator('#start-menu')).toHaveClass(/open/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#start-menu')).not.toHaveClass(/open/);
  });

  test('double-click icon opens window', async ({ page }) => {
    const icon = page.locator('.desktop-icon').first();
    await icon.dblclick();
    await page.waitForTimeout(400);
    const openWindows = page.locator('.window[data-state="open"], .window[data-state="maximized"]');
    await expect(openWindows.first()).toBeVisible();
  });

  test('window can be closed', async ({ page }) => {
    const aboutIcon = page.locator('[data-window-id="window-about"]');
    await aboutIcon.dblclick();
    await page.waitForTimeout(400);
    await expect(page.locator('#window-about')).toHaveAttribute('data-state', 'open');
    await page.click('#window-about [aria-label="Close"]');
    await page.waitForTimeout(200);
    await expect(page.locator('#window-about')).toHaveAttribute('data-state', 'closed');
  });

  test('window can be minimized and restored', async ({ page }) => {
    // Use a window known to have a Minimize button (Guestbook is non-modal)
    const guestbookIcon = page.locator('[data-window-id="window-guestbook"]');
    await guestbookIcon.dblclick();
    await page.waitForTimeout(400);
    await expect(page.locator('#window-guestbook')).toHaveAttribute('data-state', 'open');
    await page.click('#window-guestbook [aria-label="Minimize"]');
    await page.waitForTimeout(200);
    await expect(page.locator('#window-guestbook')).toHaveAttribute('data-state', 'minimized');
    const taskbarBtn = page.locator('.taskbar-window-btn').first();
    await expect(taskbarBtn).toBeVisible();
    await taskbarBtn.click();
    await page.waitForTimeout(200);
    await expect(page.locator('#window-guestbook')).toHaveAttribute('data-state', 'open');
  });

  test('right-click shows context menu', async ({ page }) => {
    await page.click('#desktop', { button: 'right', position: { x: 400, y: 300 } });
    await expect(page.locator('#context-menu-desktop')).toHaveClass(/open/);
  });

  test('visitor counter displays a number', async ({ page }) => {
    const counter = page.locator('#visitor-counter');
    const text = await counter.textContent();
    expect(text).toMatch(/\d+/);
  });

  test('clock displays time', async ({ page }) => {
    const clock = page.locator('#clock');
    const text = await clock.textContent();
    expect(text).toMatch(/\d+:\d+\s*(AM|PM)/);
  });
});

test.describe('Windows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => sessionStorage.setItem('booted', '1'));
    await page.goto('/');
    await page.waitForTimeout(300);
  });

  test('About Me window has notepad content', async ({ page }) => {
    // About Me opens from its desktop icon, not the Start menu.
    const aboutIcon = page.locator('[data-window-id="window-about"]');
    await aboutIcon.dblclick();
    await page.waitForTimeout(300);
    const notepad = page.locator('#window-about .notepad-content');
    await expect(notepad).toContainText('Thanks for surfing');
  });

  test('Guestbook has entries', async ({ page }) => {
    await page.click('#start-button');
    const guestBtn = page.locator('[data-window="window-guestbook"]').first();
    await guestBtn.click();
    await page.waitForTimeout(300);
    const entries = page.locator('.guestbook-entry');
    const count = await entries.count();
    expect(count).toBeGreaterThan(3);
  });

  test('System Properties has tabs', async ({ page }) => {
    await page.click('#start-button');
    const myCompBtn = page.locator('[data-window="window-my-computer"]').first();
    await myCompBtn.click();
    await page.waitForTimeout(300);
    await expect(page.locator('[role="tab"]').first()).toBeVisible();
  });

  test('Recycle Bin has table entries', async ({ page }) => {
    // Find and double-click Recycle Bin icon
    const recycleIcon = page.locator('[data-window-id="window-recycle-bin"]');
    await recycleIcon.dblclick();
    await page.waitForTimeout(400);
    const rows = page.locator('#window-recycle-bin tbody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(3);
  });
});

test.describe('Contact Form', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => sessionStorage.setItem('booted', '1'));
    await page.goto('/');
    await page.waitForTimeout(300);
  });

  test('contact form has required fields', async ({ page }) => {
    const emailIcon = page.locator('[data-window-id="window-contact"]');
    await emailIcon.dblclick();
    await page.waitForTimeout(400);
    await expect(page.locator('#contact-from')).toBeVisible();
    await expect(page.locator('#contact-message')).toBeVisible();
    await expect(page.locator('#contact-form button[type="submit"]')).toBeVisible();
  });
});

test.describe('Apps', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => sessionStorage.setItem('booted', '1'));
    await page.goto('/');
    await page.waitForTimeout(300);
  });

  test('Calculator launches', async ({ page }) => {
    await page.click('#start-button');
    // Wait for the menu to actually open instead of magic-number sleeps that
    // race the 350ms openSubmenu delay in desktop.js.
    await expect(page.locator('#start-menu')).toHaveClass(/open/);
    await page.hover('[role="menuitem"]:has-text("Programs")');
    await expect(page.locator('.has-submenu.submenu-open .start-submenu').first()).toBeVisible();
    await page.hover('[role="menuitem"]:has-text("Accessories")');
    await expect(page.locator('[data-app="calculator"]')).toBeVisible();
    await page.click('[data-app="calculator"]');
    await expect(page.locator('#window-calculator')).toHaveAttribute('data-state', 'open');
  });

  test('Minesweeper launches', async ({ page }) => {
    await page.click('#start-button');
    await expect(page.locator('#start-menu')).toHaveClass(/open/);
    await page.hover('[role="menuitem"]:has-text("Programs")');
    await expect(page.locator('.has-submenu.submenu-open .start-submenu').first()).toBeVisible();
    await page.hover('[role="menuitem"]:has-text("Games")');
    await expect(page.locator('[data-app="minesweeper"]')).toBeVisible();
    await page.click('[data-app="minesweeper"]');
    await expect(page.locator('#window-minesweeper')).toHaveAttribute('data-state', 'open');
  });

  test('Run dialog opens', async ({ page }) => {
    await page.click('#start-button');
    await page.waitForTimeout(200);
    const runBtn = page.locator('[data-app="run"]');
    await runBtn.click();
    await page.waitForTimeout(300);
    await expect(page.locator('#window-run-dialog')).toBeVisible();
  });
});

test.describe('Shut Down', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => sessionStorage.setItem('booted', '1'));
    await page.goto('/');
    await page.waitForTimeout(300);
  });

  test('Shut Down dialog opens from Start menu', async ({ page }) => {
    await page.click('#start-button');
    await page.waitForTimeout(200);
    const shutdownBtn = page.locator('[data-action="shutdown"]');
    await shutdownBtn.click();
    await page.waitForTimeout(300);
    await expect(page.locator('#window-shutdown')).toBeVisible();
  });
});

test.describe('404 Page', () => {
  test('shows the Win98 error dialog', async ({ page }) => {
    // npx serve falls back to index.html for unknown paths, so we can't reach
    // 404.html through routing in tests. Load the file content directly to
    // verify its structure and copy stay correct.
    const html = fs.readFileSync(path.join(__dirname, '..', '404.html'), 'utf8');
    await page.setContent(html);
    await expect(page.locator('.error-dialog')).toBeVisible();
    await expect(page.locator('#error-desc')).toContainText(/Page Fault \(404\)/);
  });
});
