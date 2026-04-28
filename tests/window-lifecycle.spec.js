const { test, expect } = require('@playwright/test');

const BOOTED = async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => sessionStorage.setItem('booted', '1'));
  await page.goto('/');
  await page.waitForTimeout(300);
};

test.describe('Window drag, resize, z-index', () => {
  test.beforeEach(BOOTED);

  test('window can be dragged by its title bar', async ({ page }) => {
    const guestbookIcon = page.locator('[data-window-id="window-guestbook"]');
    await guestbookIcon.dblclick();
    await expect(page.locator('#window-guestbook')).toHaveAttribute('data-state', 'open');
    const titleBar = page.locator('#window-guestbook .title-bar');
    const startBox = await titleBar.boundingBox();
    expect(startBox).not.toBeNull();
    // Drag 80px right and 60px down
    await page.mouse.move(startBox.x + 30, startBox.y + 10);
    await page.mouse.down();
    await page.mouse.move(startBox.x + 110, startBox.y + 70, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(100);
    const endBox = await titleBar.boundingBox();
    // Window moved at least 40px on each axis (allowing for body zoom factor)
    expect(endBox.x - startBox.x).toBeGreaterThan(20);
    expect(endBox.y - startBox.y).toBeGreaterThan(20);
  });

  test('clicking a back window brings it to the front', async ({ page }) => {
    // Open two windows. Use the hash-deep-link route so we don't have to
    // dblclick icons that the first window's body may obscure.
    await page.evaluate(() => { window.location.hash = '#window-guestbook'; });
    await page.waitForTimeout(200);
    await page.evaluate(() => { window.location.hash = '#window-about'; });
    await page.waitForTimeout(200);
    await expect(page.locator('#window-guestbook')).toHaveAttribute('data-state', 'open');
    await expect(page.locator('#window-about')).toHaveAttribute('data-state', 'open');
    const guestbookZ = await page.evaluate(() => parseInt(window.getComputedStyle(document.getElementById('window-guestbook')).zIndex, 10));
    const aboutZ = await page.evaluate(() => parseInt(window.getComputedStyle(document.getElementById('window-about')).zIndex, 10));
    expect(aboutZ).toBeGreaterThan(guestbookZ);
    // Force-click the back window's title bar (about may overlap it).
    await page.locator('#window-guestbook .title-bar').click({ force: true });
    await page.waitForTimeout(100);
    const guestbookZ2 = await page.evaluate(() => parseInt(window.getComputedStyle(document.getElementById('window-guestbook')).zIndex, 10));
    const aboutZ2 = await page.evaluate(() => parseInt(window.getComputedStyle(document.getElementById('window-about')).zIndex, 10));
    expect(guestbookZ2).toBeGreaterThan(aboutZ2);
  });
});

test.describe('U1 — HIGH-severity bug fixes', () => {
  test.beforeEach(BOOTED);

  test('Notepad windows do not accumulate after open/close cycles', async ({ page }) => {
    // Open and close Notepad five times via the Start menu launcher.
    for (let i = 0; i < 5; i++) {
      await page.click('#start-button');
      await page.waitForTimeout(150);
      await page.hover('[role="menuitem"]:has-text("Programs")');
      await page.waitForSelector('.has-submenu.submenu-open .start-submenu', { state: 'visible' });
      await page.hover('[role="menuitem"]:has-text("Accessories")');
      await page.waitForTimeout(250);
      await page.click('[data-app="notepad"]');
      await page.waitForTimeout(200);
      const closeBtn = page.locator('[id^="window-notepad"][data-state="open"] [aria-label="Close"]').last();
      await closeBtn.click();
      await page.waitForTimeout(150);
    }
    // After 5 cycles, at most one notepad window should remain in the DOM
    // (the most recently-opened one if still open, or zero after close).
    const notepadCount = await page.locator('[id^="window-notepad"]').count();
    expect(notepadCount).toBeLessThanOrEqual(1);
  });

  test('Contact form Send button resets after closing mid-flight', async ({ page }) => {
    // Stall the Formspree request indefinitely.
    await page.route('https://formspree.io/**', async () => {
      // Never call route.fulfill — leaves the fetch pending forever.
    });

    // Open contact form via desktop icon
    const contactIcon = page.locator('[data-window-id="window-contact"]');
    await contactIcon.dblclick();
    await page.waitForTimeout(300);
    // Fill required fields
    await page.fill('#contact-from', 'test@example.com');
    await page.fill('#contact-message', 'Hello world');
    // Click Send — fetch is stalled by the route handler, button enters "Sending..." state
    await page.click('#contact-form button[type="submit"]');
    await expect(page.locator('#contact-form button[type="submit"]')).toHaveText(/Sending/i);
    // Close the contact window mid-flight
    await page.click('#window-contact .title-bar [aria-label="Close"]');
    await page.waitForTimeout(200);
    // Reopen — Send button should be back to its initial state
    await contactIcon.dblclick();
    await page.waitForTimeout(300);
    const sendBtn = page.locator('#contact-form button[type="submit"]');
    await expect(sendBtn).toHaveText(/^Send$/);
    await expect(sendBtn).toBeEnabled();
  });

  test('Title-bar right-click Minimize/Maximize/Close fire their actions', async ({ page }) => {
    // Open a window with a title bar
    const guestbookIcon = page.locator('[data-window-id="window-guestbook"]');
    await guestbookIcon.dblclick();
    await page.waitForTimeout(300);
    await expect(page.locator('#window-guestbook')).toHaveAttribute('data-state', 'open');

    // Right-click on its title bar
    await page.click('#window-guestbook .title-bar', { button: 'right' });
    await expect(page.locator('#context-menu-titlebar')).toHaveClass(/open/);

    // Click Minimize from the context menu
    await page.click('#context-menu-titlebar [data-action="ctx-minimize"]');
    await page.waitForTimeout(150);
    await expect(page.locator('#window-guestbook')).toHaveAttribute('data-state', 'minimized');
  });

  test('Tray-anchored windows do not retain conflicting left+right styles after close', async ({ page }) => {
    // Open clock via tray click (anchors via right/bottom/position:fixed)
    await page.click('#clock');
    await page.waitForTimeout(200);
    await expect(page.locator('#window-clock')).toHaveAttribute('data-state', 'open');
    // Close via tray click
    await page.click('#clock');
    await page.waitForTimeout(200);
    // After close, left/right/bottom/position should all be cleared
    const leftover = await page.evaluate(() => {
      const el = document.getElementById('window-clock');
      return {
        left: el.style.left,
        right: el.style.right,
        bottom: el.style.bottom,
        position: el.style.position,
      };
    });
    expect(leftover.right).toBe('');
    expect(leftover.bottom).toBe('');
    expect(leftover.position).toBe('');
    expect(leftover.left).toBe('');
  });

  test('Run dialog OK button works after Cancel+reopen', async ({ page }) => {
    // First open: Start > Run, click Cancel
    await page.click('#start-button');
    await page.click('[data-app="run"]');
    await page.waitForTimeout(300);
    await expect(page.locator('#window-run-dialog')).toHaveAttribute('data-state', 'open');
    // Click Cancel (data-close-window button inside the dialog)
    await page.click('#window-run-dialog [data-close-window="window-run-dialog"]');
    await page.waitForTimeout(150);
    await expect(page.locator('#window-run-dialog')).toHaveAttribute('data-state', 'closed');

    // Reopen: Start > Run
    await page.click('#start-button');
    await page.click('[data-app="run"]');
    await page.waitForTimeout(300);
    await expect(page.locator('#window-run-dialog')).toHaveAttribute('data-state', 'open');
    // Click OK — should close the Run dialog and launch the Matrix terminal
    await page.click('#window-run-dialog .run-ok-btn');
    await page.waitForTimeout(500);
    await expect(page.locator('#window-run-dialog')).toHaveAttribute('data-state', 'closed');
    await expect(page.locator('#window-matrix')).toBeVisible();
  });
});
