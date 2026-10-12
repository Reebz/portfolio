// Signing the Guestbook.
//
// A visitor signs with a name (30 characters) and a message (140
// characters). The entry goes through the Contact form's Formspree endpoint
// with the subject "Guestbook entry" and lands in Mitch's inbox; nothing
// appears on the page until he publishes it. A hidden trap field stops
// simple bots before anything is sent, and a failed signing opens the
// failed-send box titled "Guestbook".
const { test, expect } = require('@playwright/test');
const { mockGoatCounter, mockFormspree } = require('./_helpers');

const APPROVAL_NOTE = 'Your entry will appear after the webmaster approves it.';

async function bootedDesktop(page) {
  await mockGoatCounter(page);
  await page.goto('/');
  await page.evaluate(() => sessionStorage.setItem('booted', '1'));
  await page.goto('/');
  await expect(page.locator('#desktop')).toBeVisible();
}

async function openGuestbook(page) {
  await page.evaluate(() => window.__win98.open('window-guestbook'));
  await expect(page.locator('#window-guestbook')).toHaveAttribute('data-state', 'open');
}

async function fillGuestbook(page, { name = 'Sam', message = 'Love the Minesweeper!' } = {}) {
  await openGuestbook(page);
  await page.fill('#guestbook-name', name);
  await page.fill('#guestbook-message', message);
}

function signButton(page) {
  return page.locator('#guestbook-form button[type="submit"]');
}

function approvalNote(page) {
  return page.locator('#guestbook-form [role="status"]');
}

function box(page) {
  return page.locator('#window-send-error');
}

// The visitor's date as the page formats it, MM/DD/YYYY.
function pageDate(page) {
  return page.evaluate(() => {
    const d = new Date();
    const two = (n) => String(n).padStart(2, '0');
    return `${two(d.getMonth() + 1)}/${two(d.getDate())}/${d.getFullYear()}`;
  });
}

test.describe('Guestbook signing form', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install();
    await bootedDesktop(page);
  });

  test('AE1: signing sends a "Guestbook entry", clears the form and shows the approval note', async ({ page }) => {
    const formspree = await mockFormspree(page, 'ok');
    await fillGuestbook(page);
    await signButton(page).click();

    await expect(approvalNote(page)).toHaveText(APPROVAL_NOTE);
    expect(formspree.requests).toHaveLength(1);
    const sent = formspree.requests[0];
    expect(sent).toEqual({
      subject: 'Guestbook entry',
      name: 'Sam',
      message: 'Love the Minesweeper!',
      date: await pageDate(page),
    });
    expect(sent.date).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    await expect(page.locator('#guestbook-name')).toHaveValue('');
    await expect(page.locator('#guestbook-message')).toHaveValue('');
    await expect(signButton(page)).toHaveText('Sign Guestbook');
    await expect(signButton(page)).toBeEnabled();
    await expect(page.locator('#window-guestbook .guestbook-entry')).toHaveCount(5);
  });

  test('AE2: the message keeps 140 characters and the name keeps 30', async ({ page }) => {
    await openGuestbook(page);
    await page.fill('#guestbook-message', 'm'.repeat(300));
    await page.fill('#guestbook-name', 'n'.repeat(31));
    await expect(page.locator('#guestbook-message')).toHaveValue('m'.repeat(140));
    await expect(page.locator('#guestbook-name')).toHaveValue('n'.repeat(30));
  });

  for (const empty of ['name', 'message']) {
    test(`an empty ${empty} stops at the browser's validation and sends nothing`, async ({ page }) => {
      const formspree = await mockFormspree(page, 'ok');
      await fillGuestbook(page, { [empty]: '' });
      await signButton(page).click();

      const missing = await page.locator(`#guestbook-${empty}`).evaluate((el) => el.validity.valueMissing);
      expect(missing).toBe(true);
      await page.waitForTimeout(200);
      expect(formspree.requests).toHaveLength(0);
      await expect(approvalNote(page)).toHaveText('');
    });
  }

  test('AE4: a filled trap shows the approval note and sends nothing', async ({ page }) => {
    const formspree = await mockFormspree(page, 'ok');
    await fillGuestbook(page);
    await page.locator('#guestbook-form [name="_gotcha"]').evaluate((el) => { el.value = 'http://spam.example'; });
    await signButton(page).click();

    await expect(approvalNote(page)).toHaveText(APPROVAL_NOTE);
    await page.waitForTimeout(200);
    expect(formspree.requests).toHaveLength(0);
  });

  test('AE7: a 429 opens the box titled Guestbook, with the entry in its mail link', async ({ page }) => {
    await mockFormspree(page, 'rate-limited');
    await fillGuestbook(page);
    await signButton(page).click();

    await expect(page.getByRole('alertdialog', { name: 'Guestbook' })).toBeVisible();
    await expect(box(page)).toContainText('Your guestbook entry could not be sent.');
    await expect(box(page)).toContainText('Wait a minute');
    const href = await box(page).getByRole('link', { name: 'Open in Mail App' }).getAttribute('href');
    const params = new URL(href).searchParams;
    expect(params.get('subject')).toBe('Guestbook entry');
    expect(params.get('body')).toBe(`Name: Sam\r\nDate: ${await pageDate(page)}\r\n\r\nLove the Minesweeper!`);
    await expect(signButton(page)).toHaveText('Sign Guestbook');
    await expect(page.locator('#guestbook-message')).toHaveValue('Love the Minesweeper!');
  });

  test("a failed signing replaces Contact's box with one titled Guestbook", async ({ page }) => {
    await mockFormspree(page, 'blocked');
    await page.evaluate(() => window.__win98.open('window-contact'));
    await page.fill('#contact-from', 'sam@example.com');
    await page.fill('#contact-message', 'A Contact message');
    // Contact's box may cover a form's button, so both forms submit directly.
    await page.locator('#contact-form').evaluate((form) => form.requestSubmit());
    await expect(page.getByRole('alertdialog', { name: 'Contact' })).toBeVisible();

    await fillGuestbook(page);
    await page.locator('#guestbook-form').evaluate((form) => form.requestSubmit());

    await expect(page.getByRole('alertdialog', { name: 'Guestbook' })).toBeVisible();
    await expect(page.locator('.window#window-send-error')).toHaveCount(1);
    const href = await box(page).getByRole('link', { name: 'Open in Mail App' }).getAttribute('href');
    expect(new URL(href).searchParams.get('body')).toContain('Love the Minesweeper!');
    expect(new URL(href).searchParams.get('body')).not.toContain('A Contact message');
  });

  test('the form sits between the heading and the first entry, with the public-entries note', async ({ page }) => {
    await openGuestbook(page);
    const order = await page.locator('#window-guestbook .window-body').evaluate((body) =>
      Array.from(body.children).map((el) => el.id || el.tagName.toLowerCase() + '.' + el.className)
    );
    expect(order.slice(0, 3)).toEqual(['h2.', 'guestbook-form', 'div.guestbook-entry']);
    await expect(page.locator('#guestbook-form')).toContainText('Approved entries are public and stay in this site\'s public history.');
  });

  test("Retry on the Guestbook's box once sends work clears the form and shows the approval note", async ({ page }) => {
    const formspree = await mockFormspree(page, 'blocked');
    await fillGuestbook(page);
    await signButton(page).click();
    await expect(box(page)).toBeVisible();

    formspree.setMode('ok');
    await box(page).getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(box(page)).toHaveCount(0);
    await expect(approvalNote(page)).toHaveText(APPROVAL_NOTE);
    await expect(page.locator('#guestbook-name')).toHaveValue('');
    await expect(page.locator('#guestbook-message')).toHaveValue('');
  });

  test('after one signing, a failed second signing opens the box with no approval note behind it', async ({ page }) => {
    const formspree = await mockFormspree(page, 'ok');
    await fillGuestbook(page);
    await signButton(page).click();
    await expect(approvalNote(page)).toHaveText(APPROVAL_NOTE);

    formspree.setMode('server-error');
    await page.fill('#guestbook-name', 'Sam again');
    await page.fill('#guestbook-message', 'Second note');
    await signButton(page).click();
    await expect(box(page)).toBeVisible();
    await expect(approvalNote(page)).toHaveText('');
  });

  test('closing the Guestbook mid-send resets the button, and a late 2xx leaves new text alone', async ({ page }) => {
    const formspree = await mockFormspree(page, 'hang');
    await fillGuestbook(page);
    await signButton(page).click();
    await expect(signButton(page)).toHaveText('Signing...');

    await page.locator('#window-guestbook .title-bar [aria-label="Close"]').click();
    await expect(page.locator('#window-guestbook')).toHaveAttribute('data-state', 'closed');
    await openGuestbook(page);
    await expect(signButton(page)).toHaveText('Sign Guestbook');
    await expect(signButton(page)).toBeEnabled();
    await page.fill('#guestbook-message', 'A fresh draft');

    await formspree.release('ok');
    await page.waitForTimeout(100);
    await expect(page.locator('#guestbook-message')).toHaveValue('A fresh draft');
    await expect(approvalNote(page)).toHaveText('');

    formspree.setMode('ok');
    await page.fill('#guestbook-name', 'Sam');
    await signButton(page).click();
    await expect(approvalNote(page)).toHaveText(APPROVAL_NOTE);
  });

  test('closing the Guestbook clears the approval note', async ({ page }) => {
    await mockFormspree(page, 'ok');
    await fillGuestbook(page);
    await signButton(page).click();
    await expect(approvalNote(page)).toHaveText(APPROVAL_NOTE);

    await page.locator('#window-guestbook .title-bar [aria-label="Close"]').click();
    await openGuestbook(page);
    await expect(approvalNote(page)).toHaveText('');
  });

  test('Esc in the message field leaves the Guestbook open', async ({ page }) => {
    await openGuestbook(page);
    await page.locator('#guestbook-message').focus();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    await expect(page.locator('#window-guestbook')).toHaveAttribute('data-state', 'open');
  });
});
