// Published guestbook entries.
//
// Mitch publishes approved entries in guestbook.json. The first Guestbook
// open loads the file and shows its valid entries above the five 1999 ones,
// newest first, as plain text built like the 1999 entries. A missing or
// broken file leaves only the 1999 entries and logs nothing. Each spec
// answers guestbook.json itself, so none depends on the committed file.
const { test, expect } = require('@playwright/test');
const { bootedDesktop, attachConsoleGate, assertConsoleClean } = require('./_helpers');

const NAMES_1999 = ['CoolDude99', 'xX_WebMaster_Xx', '~*SuRfErGrL*~', 'hackerman_2600', 'FutureBoy2000'];

// Answers every guestbook.json request with `answer` and counts the requests.
async function stubEntriesFile(page, answer) {
  const file = { requests: 0 };
  await page.route('**/guestbook.json', (route) => {
    file.requests++;
    return route.fulfill(answer);
  });
  return file;
}

function jsonAnswer(entries) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify(entries) };
}

async function openGuestbook(page) {
  await page.evaluate(() => window.__win98.open('window-guestbook'));
  await expect(page.locator('#window-guestbook')).toHaveAttribute('data-state', 'open');
}

async function closeGuestbook(page) {
  await page.locator('#window-guestbook .title-bar [aria-label="Close"]').click();
  await expect(page.locator('#window-guestbook')).toHaveAttribute('data-state', 'closed');
}

function entryNames(page) {
  return page.locator('#window-guestbook .guestbook-entry .guestbook-name').allTextContents();
}

test.describe('Published guestbook entries', () => {
  test('AE3: HTML and a web address in an entry show as typed characters', async ({ page }) => {
    await stubEntriesFile(page, jsonAnswer([
      { name: 'Sam', date: '10/12/2026', message: '<b>hi</b> see https://example.com' },
    ]));
    await bootedDesktop(page);
    await openGuestbook(page);

    const entry = page.locator('#window-guestbook .guestbook-published');
    await expect(entry.locator('.guestbook-message')).toHaveText('<b>hi</b> see https://example.com');
    await expect(page.locator('#window-guestbook b')).toHaveCount(0);
    await expect(page.locator('#window-guestbook .window-body a')).toHaveCount(0);
  });

  test('entries show newest first above the 1999 ones, which stay last with no bottom border on the last', async ({ page }) => {
    await stubEntriesFile(page, jsonAnswer([
      { name: 'Older', date: '09/30/2026', message: 'First in the file' },
      { name: 'Newer', date: '10/12/2026', message: 'Second in the file' },
    ]));
    await bootedDesktop(page);
    await openGuestbook(page);

    await expect(page.locator('#window-guestbook .guestbook-published')).toHaveCount(2);
    expect(await entryNames(page)).toEqual(['Newer', 'Older', ...NAMES_1999]);
    const lastBorder = await page.locator('#window-guestbook .guestbook-entry').last()
      .evaluate((el) => getComputedStyle(el).borderBottomStyle);
    expect(lastBorder).toBe('none');
  });

  test('entries with the same date keep their file order, and years sort before months', async ({ page }) => {
    await stubEntriesFile(page, jsonAnswer([
      { name: 'Dec 2025', date: '12/31/2025', message: 'a' },
      { name: 'Same day A', date: '01/02/2026', message: 'b' },
      { name: 'Same day B', date: '01/02/2026', message: 'c' },
    ]));
    await bootedDesktop(page);
    await openGuestbook(page);

    await expect(page.locator('#window-guestbook .guestbook-published')).toHaveCount(3);
    expect(await entryNames(page)).toEqual(['Same day A', 'Same day B', 'Dec 2025', ...NAMES_1999]);
  });

  test("an entry shows its name, date and message with the 1999 entries' classes", async ({ page }) => {
    await stubEntriesFile(page, jsonAnswer([{ name: 'Sam', date: '10/12/2026', message: 'Love the Minesweeper!' }]));
    await bootedDesktop(page);
    await openGuestbook(page);

    const entry = page.locator('#window-guestbook .guestbook-published');
    await expect(entry).toHaveClass(/\bguestbook-entry\b/);
    await expect(entry.locator('.guestbook-name')).toHaveText('Sam');
    await expect(entry.locator('.guestbook-date')).toHaveText('10/12/2026');
    await expect(entry.locator('.guestbook-message')).toHaveText('Love the Minesweeper!');
    expect(await entry.evaluate((el) => el.textContent)).toBe('Sam 10/12/2026Love the Minesweeper!');
  });

  test("a line break in a message shows as a line break, and the 1999 entries' layout stays", async ({ page }) => {
    await stubEntriesFile(page, jsonAnswer([{ name: 'Sam', date: '10/12/2026', message: 'Line one\nLine two' }]));
    await bootedDesktop(page);
    await openGuestbook(page);

    const message = page.locator('#window-guestbook .guestbook-published .guestbook-message');
    expect(await message.evaluate((el) => el.innerText)).toBe('Line one\nLine two');
    const whiteSpace1999 = await page.locator('#window-guestbook .guestbook-entry:not(.guestbook-published) .guestbook-message')
      .first().evaluate((el) => getComputedStyle(el).whiteSpace);
    expect(whiteSpace1999).toBe('normal');
  });

  test('entries that break the rules are skipped while their valid neighbours show', async ({ page }) => {
    await stubEntriesFile(page, jsonAnswer([
      { name: 42, date: '10/12/2026', message: 'A number for a name' },
      { name: 'n'.repeat(31), date: '10/12/2026', message: 'A 31-character name' },
      { name: 'Long message', date: '10/12/2026', message: 'm'.repeat(141) },
      { name: 'ISO date', date: '2026-10-12', message: 'Wrong date format' },
      { name: 'Valid', date: '10/11/2026', message: 'Kept' },
      null,
      { name: 'Also valid', date: '10/10/2026', message: 'm'.repeat(140) },
    ]));
    await bootedDesktop(page);
    await openGuestbook(page);

    await expect(page.locator('#window-guestbook .guestbook-published')).toHaveCount(2);
    expect(await entryNames(page)).toEqual(['Valid', 'Also valid', ...NAMES_1999]);
  });

  const BROKEN_FILES = [
    ['invalid JSON', { status: 200, contentType: 'application/json', body: '[{"name": "Sam",' }],
    ['an HTML page', { status: 200, contentType: 'text/html', body: '<!doctype html><title>Not found</title>' }],
    ['a 404', { status: 404, contentType: 'text/html', body: 'Not found' }],
  ];
  for (const [label, answer] of BROKEN_FILES) {
    test(`a file that answers ${label} leaves only the 1999 entries and logs no error`, async ({ page }) => {
      // The browser itself reports a failed load as a console error; only
      // that line, for guestbook.json, is ignored here.
      const errors = [];
      page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        if (/guestbook\.json$/.test(msg.location().url) && /Failed to load resource/.test(msg.text())) return;
        errors.push(msg.text());
      });
      page.on('pageerror', (err) => errors.push(err.message));
      await stubEntriesFile(page, answer);
      await bootedDesktop(page);
      await openGuestbook(page);
      await page.waitForTimeout(300);

      expect(await entryNames(page)).toEqual(NAMES_1999);
      expect(errors).toEqual([]);
    });
  }

  test('the file is not loaded on a cold load, and is loaded and shown once across reopens', async ({ page }) => {
    const gate = attachConsoleGate(page);
    const file = await stubEntriesFile(page, jsonAnswer([{ name: 'Sam', date: '10/12/2026', message: 'Hi' }]));
    await bootedDesktop(page);
    await page.waitForTimeout(300);
    expect(file.requests).toBe(0);

    await openGuestbook(page);
    await expect(page.locator('#window-guestbook .guestbook-published')).toHaveCount(1);
    await closeGuestbook(page);
    await openGuestbook(page);
    await page.waitForTimeout(300);

    expect(file.requests).toBe(1);
    await expect(page.locator('#window-guestbook .guestbook-published')).toHaveCount(1);
    assertConsoleClean(gate);
  });

  test('after a failed load, the next open tries again', async ({ page }) => {
    let fail = true;
    let requests = 0;
    await page.route('**/guestbook.json', (route) => {
      requests++;
      if (fail) return route.fulfill({ status: 200, contentType: 'application/json', body: 'not json' });
      return route.fulfill(jsonAnswer([{ name: 'Sam', date: '10/12/2026', message: 'Hi' }]));
    });
    await bootedDesktop(page);
    await openGuestbook(page);
    await expect.poll(() => requests).toBe(1);
    await closeGuestbook(page);

    fail = false;
    await openGuestbook(page);
    await expect(page.locator('#window-guestbook .guestbook-published')).toHaveCount(1);
    expect(requests).toBe(2);
  });

  // The committed file starts empty and grows as Mitch publishes, so this
  // checks only that it loads cleanly with the 1999 entries still last.
  test('the committed file loads with the 1999 entries last and a clean console', async ({ page }) => {
    const gate = attachConsoleGate(page);
    await bootedDesktop(page);
    await openGuestbook(page);
    await page.waitForTimeout(300);

    expect((await entryNames(page)).slice(-NAMES_1999.length)).toEqual(NAMES_1999);
    assertConsoleClean(gate);
  });
});
