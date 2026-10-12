// Tab title and link card.
//
// LinkedIn, Slack, iMessage, X, and similar apps read a shared link's <head>
// without running its scripts and draw a preview card from it. The card leads
// with Mitch's name and role line and leaves out the hardware-spec joke,
// which the browser-tab title keeps. The card tests read the head the way
// those apps do, with JavaScript off.
//
// The card picture is img/link-card.png, which `npm run card` captures from
// the real desktop. That command also writes the start of the PNG's SHA-256
// into the og:image address, because apps cache card pictures by address.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { mockGoatCounter } = require('./_helpers');

const TAB_TITLE = 'Mitch Ribar | Portfolio 98 | PII-233mHz 32MB RAM Voodoo2 GFX';
const ROLE_LINE = 'AI products, growth systems & software';
// Pieces of the hardware-spec joke, none of which may reach the card.
const HARDWARE_SPECS = ['PII-233mHz', '32MB RAM', 'Voodoo2 GFX'];
const HOME = 'https://reebz.com/';
const CARD_PNG = path.join(__dirname, '..', 'img', 'link-card.png');
const CARD_IMAGE_URL = /^https:\/\/reebz\.com\/img\/link-card\.png\?v=([0-9a-f]{8})$/;

// A PNG opens with an 8-byte signature and then its IHDR chunk, whose first
// two fields are the width and height as big-endian 32-bit numbers.
function pngSize(file) {
  const bytes = fs.readFileSync(file);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(bytes.subarray(0, 8).equals(signature), `${file} starts like a PNG`).toBe(true);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test.beforeEach(async ({ page }) => {
  await mockGoatCounter(page);
});

test('R1: the tab title leads with the name and keeps the hardware-spec joke', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(TAB_TITLE);
});

// serve -s answers 200 with index.html for a missing file, so only the
// content type shows the picture is really there.
test('R4: the card picture answers image/png', async ({ request }) => {
  const res = await request.get('/img/link-card.png');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('image/png');
});

test.describe('Link card tags, read with JavaScript off', () => {
  test.use({ javaScriptEnabled: false });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('R2: og:title leads with the name, gives the role line, and drops the hardware specs', async ({ page }) => {
    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle).toHaveAttribute('content', /^Mitch Ribar/);
    const content = await ogTitle.getAttribute('content');
    expect(content).toContain(ROLE_LINE);
    for (const spec of HARDWARE_SPECS) expect(content).not.toContain(spec);
  });

  test('R3: og:description and the description tag match and name the role line and the desktop', async ({ page }) => {
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', description);
    expect(description).toContain(ROLE_LINE);
    expect(description).toContain('Windows 98 desktop');
    for (const spec of HARDWARE_SPECS) expect(description).not.toContain(spec);
  });

  test('R6: og:url and the one canonical link are https://reebz.com/', async ({ page }) => {
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', HOME);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', HOME);
  });

  test('twitter:card asks X for the large picture card', async ({ page }) => {
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
  });

  test('R4: og:image is the absolute reebz.com address of a 1200x630 PNG', async ({ page }) => {
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', CARD_IMAGE_URL);
    expect(pngSize(CARD_PNG)).toEqual({ width: 1200, height: 630 });
  });

  test('the og:image v= value is the start of the PNG\'s SHA-256', async ({ page }) => {
    const ogImage = page.locator('meta[property="og:image"]');
    await expect(ogImage).toHaveAttribute('content', CARD_IMAGE_URL);
    const v = (await ogImage.getAttribute('content')).match(CARD_IMAGE_URL)[1];
    const sha256 = crypto.createHash('sha256').update(fs.readFileSync(CARD_PNG)).digest('hex');
    expect(sha256.slice(0, v.length)).toBe(v);
  });

  test('R4: og:image:type, width, height, and alt describe the picture', async ({ page }) => {
    await expect(page.locator('meta[property="og:image:type"]')).toHaveAttribute('content', 'image/png');
    await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute('content', '1200');
    await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute('content', '630');
    await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute('content', /\S/);
  });

  // A tag inside <noscript> is only text to a browser running scripts, and
  // some card apps skip it, so each tag must sit directly in <head>.
  test('a request for / returns every tag once, directly in the head', async ({ page }) => {
    await expect(page).toHaveTitle(TAB_TITLE);
    for (const tag of [
      'meta[property="og:title"]',
      'meta[property="og:description"]',
      'meta[name="description"]',
      'meta[property="og:url"]',
      'link[rel="canonical"]',
      'meta[name="twitter:card"]',
    ]) {
      await expect(page.locator(`head > ${tag}`), tag).toHaveCount(1);
    }
  });
});
