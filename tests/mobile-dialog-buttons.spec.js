// Shut Down and Log Off dialog buttons on phones.
//
// A phone has no Esc key, so these buttons are the only way out of either
// dialog. Both dialogs sit outside #desktop, so the desktop's own button
// handling never sees their taps. Cancel, No, and the title-bar close button
// each close their dialog. tests/dialog-buttons.spec.js runs the same cases
// with clicks on the desktop project.
const { test, expect } = require('@playwright/test');
const { mockGoatCounter } = require('./_helpers');

const CASES = [
  { dialog: 'window-shutdown', action: 'shutdown', button: 'Cancel', selector: '[data-close-window="window-shutdown"]' },
  { dialog: 'window-shutdown', action: 'shutdown', button: 'The title-bar close button', selector: '.title-bar [aria-label="Close"]' },
  { dialog: 'window-logoff', action: 'logoff', button: 'No', selector: '[data-close-window="window-logoff"]' },
  { dialog: 'window-logoff', action: 'logoff', button: 'The title-bar close button', selector: '.title-bar [aria-label="Close"]' },
];

test.describe('Mobile Shut Down and Log Off dialog buttons', () => {
  test.beforeEach(async ({ page }) => {
    await mockGoatCounter(page);
    await page.goto('/');
    await page.evaluate(() => sessionStorage.setItem('booted', '1'));
    await page.goto('/');
    await expect(page.locator('#desktop')).toBeVisible();
  });

  for (const c of CASES) {
    test(`${c.button} closes #${c.dialog}`, async ({ page }) => {
      await page.locator('#start-button').tap();
      await expect(page.locator('#start-menu')).toHaveClass(/open/);
      await page.locator(`[data-action="${c.action}"]`).tap();
      const dialog = page.locator('#' + c.dialog);
      await expect(dialog).toHaveAttribute('data-state', 'open');

      await dialog.locator(c.selector).tap();
      await expect(dialog).toHaveAttribute('data-state', 'closed');
      await expect(dialog).toBeHidden();
    });
  }
});
