// Signing the Guestbook.
//
// A visitor signs with a name (30 characters) and a message (140
// characters). The entry goes through the Contact form's Formspree endpoint
// with the subject "Guestbook entry" and lands in Mitch's inbox; nothing
// appears on the page until he publishes it. A hidden trap field stops
// simple bots before anything is sent, and a failed signing opens the
// failed-send box titled "Guestbook".
const { test, expect } = require('@playwright/test');
const { bootedDesktop, mockFormspree } = require('./_helpers');

const APPROVAL_NOTE = 'Your entry will appear after the webmaster approves it.';
// The page's clock is set to this day, whose one-digit month and day show
// the date's zero padding whatever day the suite runs.
const SIGNED_ON = '03/05/2026';

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

test.describe('Guestbook signing form', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date('2026-03-05T12:00:00') });
    // The committed guestbook.json grows as Mitch publishes, so these specs
    // answer it with no entries.
    await page.route('**/guestbook.json', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
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
      date: SIGNED_ON,
    });
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
    expect(params.get('body')).toBe(`Name: Sam\r\nDate: ${SIGNED_ON}\r\n\r\nLove the Minesweeper!`);
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

  test('Retry after the message was edited sends the copy that failed and keeps the edit', async ({ page }) => {
    const formspree = await mockFormspree(page, 'blocked');
    await fillGuestbook(page);
    await signButton(page).click();
    await expect(box(page)).toBeVisible();

    await page.fill('#guestbook-message', 'Love the Minesweeper! And Napster.');
    formspree.setMode('ok');
    await box(page).getByRole('button', { name: 'Retry', exact: true }).click();

    await expect(box(page)).toHaveCount(0);
    expect(formspree.requests[1].message).toBe('Love the Minesweeper!');
    await expect(page.locator('#guestbook-message')).toHaveValue('Love the Minesweeper! And Napster.');
    await expect(approvalNote(page)).toHaveText('');
  });

  test('an edit typed while the entry is signing stays, and the approval note still shows', async ({ page }) => {
    const formspree = await mockFormspree(page, 'hang');
    await fillGuestbook(page);
    await signButton(page).click();
    await expect(signButton(page)).toHaveText('Signing...');

    await page.fill('#guestbook-message', 'Love the Minesweeper! And Napster.');
    await formspree.release('ok');

    await expect(approvalNote(page)).toHaveText(APPROVAL_NOTE);
    await expect(page.locator('#guestbook-name')).toHaveValue('Sam');
    await expect(page.locator('#guestbook-message')).toHaveValue('Love the Minesweeper! And Napster.');
    await expect(signButton(page)).toHaveText('Sign Guestbook');
    await expect(signButton(page)).toBeEnabled();
  });

  test('a newer signing replaces one still in flight, so the older deadline opens no box', async ({ page }) => {
    await mockFormspree(page, 'hang');
    await fillGuestbook(page);
    await signButton(page).click();
    await page.clock.fastForward(5000);
    await page.locator('#window-guestbook .title-bar [aria-label="Close"]').click();
    await openGuestbook(page);
    await signButton(page).click();
    await expect(signButton(page)).toHaveText('Signing...');

    // The first signing's deadline passes here; the newer one's is 5 seconds away.
    await page.clock.fastForward(3000);
    await page.waitForTimeout(100);
    await expect(box(page)).toHaveCount(0);
    await expect(signButton(page)).toHaveText('Signing...');
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
