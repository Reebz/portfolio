// One sender for the Contact and Guestbook forms.
//
// Every send has an 8-second deadline that fires on every browser, including
// Safari before 16, which lacks AbortSignal.timeout, and under Playwright's
// fake clock. A reply or deadline that lands after Contact was closed and
// reopened leaves the reopened form alone.
const { test, expect } = require('@playwright/test');
const { mockGoatCounter, mockFormspree } = require('./_helpers');

async function bootedDesktop(page) {
  await mockGoatCounter(page);
  await page.goto('/');
  await page.evaluate(() => sessionStorage.setItem('booted', '1'));
  await page.goto('/');
  await expect(page.locator('#desktop')).toBeVisible();
}

async function openContact(page) {
  await page.evaluate(() => window.__win98.open('window-contact'));
  await expect(page.locator('#window-contact')).toHaveAttribute('data-state', 'open');
}

async function fillContact(page) {
  await openContact(page);
  await page.fill('#contact-from', 'sam@example.com');
  await page.fill('#contact-subject', 'Hi');
  await page.fill('#contact-message', 'Love the Minesweeper!');
}

function sendButton(page) {
  return page.locator('#contact-form button[type="submit"]');
}

async function expectFormKept(page) {
  await expect(sendButton(page)).toBeEnabled();
  await expect(sendButton(page)).not.toHaveText('Message Sent!');
  await expect(page.locator('#contact-from')).toHaveValue('sam@example.com');
  await expect(page.locator('#contact-subject')).toHaveValue('Hi');
  await expect(page.locator('#contact-message')).toHaveValue('Love the Minesweeper!');
}

async function closeAndReopenContact(page) {
  await page.locator('#window-contact .title-bar [aria-label="Close"]').click();
  await expect(page.locator('#window-contact')).toHaveAttribute('data-state', 'closed');
  await openContact(page);
}

test.describe('Contact send deadline and late replies', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install();
    await bootedDesktop(page);
  });

  test('AE6: a send with no reply gives up after 8 seconds and keeps the form', async ({ page }) => {
    await mockFormspree(page, 'hang');
    await fillContact(page);
    await sendButton(page).click();
    await expect(sendButton(page)).toHaveText('Sending...');

    await page.clock.fastForward(8000);
    await expectFormKept(page);
  });

  test('a 2xx reply with no error key shows Message Sent! and closes Contact after 1.5 seconds', async ({ page }) => {
    await mockFormspree(page, 'ok');
    await fillContact(page);
    await sendButton(page).click();
    await expect(sendButton(page)).toHaveText('Message Sent!');

    await page.clock.fastForward(1500);
    await expect(page.locator('#window-contact')).toHaveAttribute('data-state', 'closed');
  });

  // 'error-key' is a 200 whose body carries Formspree's `error` key, which
  // counts as a failure even though the status is 2xx.
  for (const mode of ['blocked', 'server-error', 'invalid', 'error-key', 'rate-limited']) {
    test(`a ${mode} answer ends the send with the form kept`, async ({ page }) => {
      await mockFormspree(page, mode);
      await fillContact(page);
      await sendButton(page).click();
      await expectFormKept(page);
    });
  }

  test('a 2xx reply that lands after Contact was closed and reopened changes nothing', async ({ page }) => {
    const formspree = await mockFormspree(page, 'hang');
    await fillContact(page);
    await sendButton(page).click();
    await expect(sendButton(page)).toHaveText('Sending...');
    await closeAndReopenContact(page);
    await page.fill('#contact-message', 'Fresh draft');

    await formspree.release('ok');
    await page.waitForTimeout(100);
    await page.clock.fastForward(1500);

    await expect(page.locator('#window-contact')).toHaveAttribute('data-state', 'open');
    await expect(sendButton(page)).toHaveText('Send');
    await expect(sendButton(page)).toBeEnabled();
    await expect(page.locator('#contact-message')).toHaveValue('Fresh draft');
  });

  test('a deadline that fires after Contact was closed and reopened changes nothing', async ({ page }) => {
    await mockFormspree(page, 'hang');
    await fillContact(page);
    await sendButton(page).click();
    await closeAndReopenContact(page);

    await page.clock.fastForward(8000);
    await expect(sendButton(page)).toHaveText('Send');
    await expect(sendButton(page)).toBeEnabled();
  });
});
