// Shut Down and Log Off dialog buttons on the desktop.
//
// Both dialogs sit outside #desktop, so the desktop's own button handling
// never sees their clicks. Cancel, No, and the title-bar close button each
// close their dialog. tests/mobile-dialog-buttons.spec.js runs the same
// cases with taps on the phone projects.
const { test, expect } = require('@playwright/test');
const { mockGoatCounter } = require('./_helpers');

const CASES = [
  { dialog: 'window-shutdown', action: 'shutdown', button: 'Cancel', selector: '[data-close-window="window-shutdown"]' },
  { dialog: 'window-shutdown', action: 'shutdown', button: 'The title-bar close button', selector: '.title-bar [aria-label="Close"]' },
  { dialog: 'window-logoff', action: 'logoff', button: 'No', selector: '[data-close-window="window-logoff"]' },
  { dialog: 'window-logoff', action: 'logoff', button: 'The title-bar close button', selector: '.title-bar [aria-label="Close"]' },
];

test.describe('Shut Down and Log Off dialog buttons', () => {
  test.beforeEach(async ({ page }) => {
    await mockGoatCounter(page);
    await page.goto('/');
    await page.evaluate(() => sessionStorage.setItem('booted', '1'));
    await page.goto('/');
    await expect(page.locator('#desktop')).toBeVisible();
  });

  for (const c of CASES) {
    test(`${c.button} closes #${c.dialog}`, async ({ page }) => {
      await page.click('#start-button');
      await expect(page.locator('#start-menu')).toHaveClass(/open/);
      await page.click(`[data-action="${c.action}"]`);
      const dialog = page.locator('#' + c.dialog);
      await expect(dialog).toHaveAttribute('data-state', 'open');

      await dialog.locator(c.selector).click();
      await expect(dialog).toHaveAttribute('data-state', 'closed');
      await expect(dialog).toBeHidden();
    });
  }
});
