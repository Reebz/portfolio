// The failed-send box on the desktop.
//
// When a Contact send fails or gets no answer within 8 seconds, a Win98
// message box titled "Contact" offers Retry, Open in Mail App, Copy Address
// and Cancel. It keeps a copy of what failed, stays above every window, has
// no taskbar button, and closing it hands focus back to Contact's Send
// button with everything the visitor typed still in place.
// tests/mobile-send-error-box.spec.js covers phones.
const { test, expect } = require('@playwright/test');
const { bootedDesktop, mockGoatCounter, mockFormspree } = require('./_helpers');

const MAIL = 'mitch@ribar.ai';
const SHORTENED_NOTE = '[Message shortened. The full text is still in the Contact window.]';

async function fillContact(page, { subject = 'Hi', message = 'Love the Minesweeper!' } = {}) {
  await page.evaluate(() => window.__win98.open('window-contact'));
  await expect(page.locator('#window-contact')).toHaveAttribute('data-state', 'open');
  await page.fill('#contact-from', 'sam@example.com');
  await page.fill('#contact-subject', subject);
  await page.fill('#contact-message', message);
}

function box(page) {
  return page.locator('#window-send-error');
}

function sendButton(page) {
  return page.locator('#contact-form button[type="submit"]');
}

function boxButton(page, name) {
  return box(page).getByRole('button', { name, exact: true });
}

function mailLink(page) {
  return box(page).getByRole('link', { name: 'Open in Mail App' });
}

// Fills Contact, presses Send against a blocked Formspree and waits for the box.
async function failedSend(page, fields) {
  const formspree = await mockFormspree(page, 'blocked');
  await fillContact(page, fields);
  await sendButton(page).click();
  await expect(box(page)).toBeVisible();
  return formspree;
}

async function mailParams(page) {
  const href = await mailLink(page).getAttribute('href');
  return { href, params: new URL(href).searchParams };
}

test.describe('Failed-send box on the desktop', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install();
    await bootedDesktop(page);
  });

  test('AE5: a blocked send opens the box with Retry focused, and Cancel leaves the form as typed', async ({ page }) => {
    await failedSend(page);

    await expect(page.getByRole('alertdialog', { name: 'Contact' })).toBeVisible();
    await expect(box(page)).toContainText('Your message could not be sent.');
    await expect(boxButton(page, 'Retry')).toHaveClass(/\bdefault\b/);
    await expect(boxButton(page, 'Retry')).toBeFocused();
    await page.waitForTimeout(300);
    await expect(boxButton(page, 'Retry')).toBeFocused();
    await expect(box(page).locator('img[src="img/icons/critical-32.png"]')).toBeVisible();
    await expect(sendButton(page)).toHaveText('Send');
    await expect(sendButton(page)).toBeEnabled();
    await expect(mailLink(page)).toHaveAttribute('href', `mailto:${MAIL}?subject=Hi&body=Love%20the%20Minesweeper!`);

    await boxButton(page, 'Cancel').click();
    await expect(box(page)).toHaveCount(0);
    await expect(page.locator('#contact-from')).toHaveValue('sam@example.com');
    await expect(page.locator('#contact-subject')).toHaveValue('Hi');
    await expect(page.locator('#contact-message')).toHaveValue('Love the Minesweeper!');
  });

  test('AE6: a send with no answer opens the box after 8 seconds', async ({ page }) => {
    await mockFormspree(page, 'hang');
    await fillContact(page);
    await sendButton(page).click();
    await expect(sendButton(page)).toHaveText('Sending...');
    await expect(box(page)).toHaveCount(0);

    await page.clock.fastForward(8000);
    await expect(box(page)).toBeVisible();
    await expect(box(page)).toContainText('did not answer within 8 seconds');
    await expect(sendButton(page)).toHaveText('Send');
  });

  for (const [mode, reason] of [['invalid', 'should be an email'], ['rate-limited', 'Wait a minute']]) {
    test(`a ${mode} answer puts its reason in the box`, async ({ page }) => {
      await mockFormspree(page, mode);
      await fillContact(page);
      await sendButton(page).click();
      await expect(box(page)).toContainText(reason);
    });
  }

  test('an empty Subject puts the Subject placeholder in the mail link', async ({ page }) => {
    await failedSend(page, { subject: '' });
    const { params } = await mailParams(page);
    expect(params.get('subject')).toBe('Hello from your portfolio!');
  });

  test('a 3,000-character message gives a mail link of at most 1,800 characters that ends with the shortened note', async ({ page }) => {
    // 8 UTF-16 units a line, emoji and line breaks included, 375 lines.
    const message = 'Hi \u{1F600} é\n'.repeat(375);
    expect(message).toHaveLength(3000);
    await failedSend(page, { message });

    const { href, params } = await mailParams(page);
    expect(href.length).toBeLessThanOrEqual(1800);
    const body = params.get('body');
    expect(body.startsWith('Hi \u{1F600} é\r\nHi')).toBe(true);
    expect(body.endsWith(SHORTENED_NOTE)).toBe(true);
    expect(body).not.toContain('�');
    await expect(page.locator('#contact-message')).toHaveValue(message);
  });

  test('Retry while sends still fail reads Retrying..., then updates the reason in the same box without a second ding', async ({ page }) => {
    await page.evaluate(() => {
      window.__dings = 0;
      const play = window.Sounds.playError;
      window.Sounds.playError = function () {
        window.__dings++;
        return play.apply(this, arguments);
      };
    });
    const formspree = await failedSend(page);
    await expect(box(page)).toContainText('could not reach the mail server');
    expect(await page.evaluate(() => window.__dings)).toBe(1);

    formspree.setMode('hang');
    await boxButton(page, 'Retry').click();
    const retrying = boxButton(page, 'Retrying...');
    await expect(retrying).toHaveAttribute('aria-disabled', 'true');
    await expect(retrying).toBeFocused();

    await formspree.release('server-error');
    await expect(boxButton(page, 'Retry')).not.toHaveAttribute('aria-disabled');
    await expect(boxButton(page, 'Retry')).toBeFocused();
    await expect(box(page)).toContainText('The mail server answered with error 500.');
    await expect(box(page)).not.toContainText('could not reach the mail server');
    await expect(page.locator('#window-announcer')).toHaveText('The mail server answered with error 500.');
    await expect(page.locator('.window#window-send-error')).toHaveCount(1);
    expect(await page.evaluate(() => window.__dings)).toBe(1);
  });

  test('Retry that gets a 2xx closes the box, and Contact shows Message Sent!', async ({ page }) => {
    const formspree = await failedSend(page);
    formspree.setMode('ok');
    await boxButton(page, 'Retry').click();

    await expect(box(page)).toHaveCount(0);
    await expect(sendButton(page)).toHaveText('Message Sent!');
    expect(formspree.requests).toHaveLength(2);
    expect(formspree.requests[1]).toEqual(formspree.requests[0]);
    await page.clock.fastForward(1500);
    await expect(page.locator('#window-contact')).toHaveAttribute('data-state', 'closed');
  });

  test('Retry after the message was edited sends the copy that failed and keeps the edit', async ({ page }) => {
    const formspree = await failedSend(page);
    await page.fill('#contact-message', 'Love the Minesweeper! And Napster.');
    formspree.setMode('ok');
    await boxButton(page, 'Retry').click();

    await expect(box(page)).toHaveCount(0);
    expect(formspree.requests[1].message).toBe('Love the Minesweeper!');
    await expect(sendButton(page)).toHaveText('Send');
    await page.clock.fastForward(1500);
    await expect(page.locator('#window-contact')).toHaveAttribute('data-state', 'open');
    await expect(page.locator('#contact-message')).toHaveValue('Love the Minesweeper! And Napster.');
  });

  test('closing the box during a retry aborts it, and a late 2xx changes nothing', async ({ page }) => {
    const formspree = await failedSend(page);
    formspree.setMode('hang');
    await boxButton(page, 'Retry').click();
    await expect(boxButton(page, 'Retrying...')).toBeVisible();
    await boxButton(page, 'Cancel').click();
    await expect(box(page)).toHaveCount(0);

    await formspree.release('ok');
    await page.waitForTimeout(100);
    await page.clock.fastForward(8000);
    await expect(box(page)).toHaveCount(0);
    await expect(sendButton(page)).toHaveText('Send');
    await expect(page.locator('#window-contact')).toHaveAttribute('data-state', 'open');
    await expect(page.locator('#contact-message')).toHaveValue('Love the Minesweeper!');
  });

  test('Copy Address writes the address to the clipboard and reads Copied!', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await failedSend(page);
    await boxButton(page, 'Copy Address').click();

    await expect(boxButton(page, 'Copied!')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(MAIL);
    await expect(box(page)).toBeVisible();
  });

  test('with both copy methods refused, Copy Address keeps its label and leaves the address selected', async ({ page }) => {
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => Promise.reject(new Error('Write permission denied.')) },
      });
      document.execCommand = () => false;
    });
    await failedSend(page);
    await boxButton(page, 'Copy Address').click();

    await expect.poll(() => page.evaluate(() => window.getSelection().toString())).toBe(MAIL);
    await expect(boxButton(page, 'Copy Address')).toBeVisible();
    await expect(box(page)).toBeVisible();
  });

  for (const way of ['Cancel', 'the title-bar close button', 'Esc']) {
    test(`${way} closes only the box and hands focus back to Send`, async ({ page }) => {
      await failedSend(page);
      if (way === 'Cancel') await boxButton(page, 'Cancel').click();
      else if (way === 'Esc') await page.keyboard.press('Escape');
      else await box(page).locator('.title-bar [aria-label="Close"]').click();

      await expect(box(page)).toHaveCount(0);
      await expect(page.locator('#window-contact')).toHaveAttribute('data-state', 'open');
      await expect(sendButton(page)).toBeFocused();
      await page.waitForTimeout(300);
      await expect(sendButton(page)).toBeFocused();
    });
  }

  test('the box has only a close button, and the taskbar shows only Contact', async ({ page }) => {
    await failedSend(page);
    await expect(box(page).locator('.title-bar-controls button')).toHaveCount(1);
    await expect(box(page).locator('.title-bar-controls [aria-label="Close"]')).toHaveCount(1);
    await expect(page.locator('.taskbar-window-btn')).toHaveCount(1);
    await expect(page.locator('.taskbar-window-btn[data-window-id="window-contact"]')).toHaveCount(1);
  });

  test('opening and closing the box never announces Contact opened or closed', async ({ page }) => {
    const formspree = await mockFormspree(page, 'blocked');
    await fillContact(page);
    await expect(page.locator('#window-announcer')).toHaveText('Contact opened');
    await page.evaluate(() => {
      window.__said = [];
      const el = document.getElementById('window-announcer');
      new MutationObserver(() => {
        if (el.textContent) window.__said.push(el.textContent);
      }).observe(el, { childList: true, characterData: true, subtree: true });
    });

    await sendButton(page).click();
    await expect(box(page)).toBeVisible();
    await boxButton(page, 'Cancel').click();
    await expect(box(page)).toHaveCount(0);
    await page.waitForTimeout(100);

    const said = await page.evaluate(() => window.__said);
    expect(said).not.toContain('Contact opened');
    expect(said).not.toContain('Contact closed');
    expect(formspree.requests).toHaveLength(1);
  });

  test('Show Desktop minimizes Contact and leaves the box open on top', async ({ page }) => {
    await failedSend(page);
    await page.locator('#quick-launch [data-action="show-desktop"]').click();

    await expect(page.locator('#window-contact')).toHaveAttribute('data-state', 'minimized');
    await expect(box(page)).toHaveAttribute('data-state', 'open');
    await expect(box(page)).toBeVisible();
  });

  test('pressing Send with the box open closes the box and sends again', async ({ page }) => {
    const formspree = await failedSend(page);
    formspree.setMode('ok');
    await sendButton(page).click();

    await expect(box(page)).toHaveCount(0);
    await expect(sendButton(page)).toHaveText('Message Sent!');
  });

  test('a send that fails after Contact was closed still opens the box, and closing it leaves Contact closed', async ({ page }) => {
    await mockFormspree(page, 'hang');
    await fillContact(page);
    await sendButton(page).click();
    await expect(sendButton(page)).toHaveText('Sending...');
    await page.locator('#window-contact .title-bar [aria-label="Close"]').click();
    await expect(page.locator('#window-contact')).toHaveAttribute('data-state', 'closed');

    await page.clock.fastForward(8000);
    await expect(page.getByRole('alertdialog', { name: 'Contact' })).toBeVisible();
    await boxButton(page, 'Cancel').click();
    await expect(box(page)).toHaveCount(0);
    await expect(page.locator('#window-contact')).toHaveAttribute('data-state', 'closed');
  });

  test('closing the box restores a minimized Contact with focus on Send', async ({ page }) => {
    await failedSend(page);
    await page.locator('#window-contact .title-bar [aria-label="Minimize"]').click();
    await expect(page.locator('#window-contact')).toHaveAttribute('data-state', 'minimized');

    await boxButton(page, 'Cancel').click();
    await expect(box(page)).toHaveCount(0);
    await expect(page.locator('#window-contact')).toHaveAttribute('data-state', 'open');
    await expect(sendButton(page)).toBeFocused();
  });
});

test.describe('Failed-send box with sound muted', () => {
  test('opening the box creates no AudioContext', async ({ page }) => {
    // Count every AudioContext construction on the page.
    await page.addInitScript(() => {
      window.__acCount = 0;
      ['AudioContext', 'webkitAudioContext'].forEach((name) => {
        const Orig = window[name];
        if (!Orig) return;
        window[name] = function (...args) {
          window.__acCount++;
          return new Orig(...args);
        };
        window[name].prototype = Orig.prototype;
      });
    });
    await mockGoatCounter(page);
    await page.goto('/');
    await page.evaluate(() => {
      sessionStorage.setItem('booted', '1');
      localStorage.setItem('sound-enabled', '0');
    });
    await page.goto('/');
    await expect(page.locator('#tray-speaker')).toHaveAttribute('aria-pressed', 'false');

    await failedSend(page);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.__acCount)).toBe(0);
  });
});
