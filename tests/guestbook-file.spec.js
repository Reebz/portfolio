// The committed guestbook.json.
//
// Mitch publishes approved entries by appending them to guestbook.json (see
// "Publishing a guestbook entry" in the README). The page silently skips an
// entry it cannot show and ignores a file it cannot parse, so this check
// fails loudly instead: on invalid JSON, or on any entry the page would skip.
// The rules mirror validGuestbookEntries in desktop.js, and a second check
// has the page itself show the file, so a drift between the two still fails.
//
// Runs under the desktop project. The first check reads the file directly,
// with no browser.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { bootedDesktop } = require('./_helpers');

const FILE = path.join(__dirname, '..', 'guestbook.json');
const DATE = /^\d{2}\/\d{2}\/\d{4}$/;

// Why the page would skip this entry, or null when it would show it.
function skipReason(entry) {
  if (!entry || typeof entry !== 'object') return 'is not an object';
  for (const field of ['name', 'date', 'message']) {
    if (typeof entry[field] !== 'string') return `has a ${field} that is not a string`;
  }
  if (entry.name.length > 30) return 'has a name over 30 characters';
  if (entry.message.length > 140) return 'has a message over 140 characters';
  if (!DATE.test(entry.date)) return 'has a date not written as MM/DD/YYYY';
  return null;
}

test('guestbook.json is a JSON list whose every entry the page will show', () => {
  const text = fs.readFileSync(FILE, 'utf8');
  let entries;
  expect(() => { entries = JSON.parse(text); }, 'guestbook.json must be valid JSON').not.toThrow();
  expect(Array.isArray(entries), 'guestbook.json must be a list').toBe(true);

  const problems = entries
    .map((entry, i) => ({ i, reason: skipReason(entry) }))
    .filter((p) => p.reason)
    .map((p) => `entry ${p.i + 1} ${p.reason}`);
  expect(problems).toEqual([]);
});

test('the Guestbook shows every entry in guestbook.json', async ({ page }) => {
  const entries = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  await bootedDesktop(page);
  const loaded = page.waitForResponse((response) => response.url().endsWith('/guestbook.json'));
  await page.evaluate(() => window.__win98.open('window-guestbook'));
  await loaded;
  await expect(page.locator('#window-guestbook .guestbook-published')).toHaveCount(entries.length);
});
