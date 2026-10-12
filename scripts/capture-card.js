// Captures the link-card picture, img/link-card.png, from the real desktop.
//
// Run it with `npm run card` after any visible change to the desktop, look at
// the PNG at about 400 px wide, and commit it together with index.html.
// Nothing runs it automatically, so the picture goes stale until someone does.
//
// It drives Chromium from the installed @playwright/test and answers every
// request itself from the files on disk, so it needs no server, port, or
// network. The page opens at #window-about, an address that skips the boot
// sequence and Clippy with it. A fixed clock and a hidden visitor counter
// keep the picture byte-identical from one run to the next.
//
// Afterwards it writes the start of the PNG's SHA-256 into the og:image
// address in index.html. Apps cache card pictures by address, so a new
// picture needs a new address, and an unchanged picture leaves index.html
// alone.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
const CARD_PNG = path.join(ROOT, 'img', 'link-card.png');
const INDEX_HTML = path.join(ROOT, 'index.html');
const OG_IMAGE = /(<meta property="og:image" content="https:\/\/reebz\.com\/img\/link-card\.png\?v=)([^"]*)(")/;
const VERSION_LENGTH = 8;

// A .invalid name never resolves, so only the route below can answer it.
const ORIGIN = 'https://capture.invalid';
// The 1.91:1 size link-card apps ask for, one device pixel per CSS pixel.
const VIEWPORT = { width: 1200, height: 630 };
// 10:00 AM in Sydney, the taskbar clock's time zone.
const CLOCK = new Date('2026-10-12T10:00:00+11:00');
// Where the About note sits, in the desktop's unzoomed CSS pixels: level
// with the top row of icons and right of the first three columns, so it
// covers the fourth column's icon whole instead of cutting it in half.
const ABOUT_LEFT = 248;
const ABOUT_TOP = 8;

async function answerRequest(route) {
  const url = new URL(route.request().url());
  if (url.origin === ORIGIN) {
    const file = path.join(ROOT, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return route.fulfill({ path: file });
    return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' });
  }
  // The GoatCounter tracker. An empty script keeps captures out of the
  // site's visitor stats.
  if (url.hostname === 'gc.zgo.at') {
    return route.fulfill({ contentType: 'application/javascript', body: '' });
  }
  return route.abort();
}

async function capture() {
  // The route answers every request. Failing every DNS lookup as well stops
  // the page's preconnect to jspaint.app, which no route can see. Headless
  // Chromium hides scrollbars by default, and the real Notepad always shows
  // one.
  const browser = await chromium.launch({
    args: ['--host-resolver-rules=MAP * ~NOTFOUND'],
    ignoreDefaultArgs: ['--hide-scrollbars'],
  });
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.route('**/*', answerRequest);
    await page.clock.setFixedTime(CLOCK);

    await page.goto(`${ORIGIN}/#window-about`);
    await page.waitForFunction(() =>
      !document.body.classList.contains('booting') &&
      !document.body.classList.contains('desktop-painting') &&
      document.getElementById('window-about').getAttribute('data-state') === 'open' &&
      Array.from(document.images).every((img) => img.complete) &&
      document.fonts.check('16px "Perfect DOS VGA 437"'));

    // Opening at the cascade spot capped the note's height so it cleared the
    // taskbar. Lifting the cap, as a resize does, lets the whole note show.
    // The visitor counter would put a changing number on a public picture.
    await page.evaluate(({ left, top }) => {
      const about = document.getElementById('window-about');
      about.style.left = `${left}px`;
      about.style.top = `${top}px`;
      about.style.maxHeight = '';
      document.getElementById('visitor-counter').style.display = 'none';
    }, { left: ABOUT_LEFT, top: ABOUT_TOP });

    const png = await page.screenshot({ animations: 'disabled' });
    return { png, pageErrors };
  } finally {
    await browser.close();
  }
}

async function main() {
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  const tag = html.match(OG_IMAGE);
  if (!tag) {
    throw new Error('index.html has no og:image tag for https://reebz.com/img/link-card.png?v= to update.');
  }

  const { png, pageErrors } = await capture();
  for (const message of pageErrors) console.error(`Page error: ${message}`);
  if (pageErrors.length === 0) console.log('No page errors.');

  const previous = fs.existsSync(CARD_PNG) ? fs.readFileSync(CARD_PNG) : null;
  if (previous && previous.equals(png)) {
    console.log('img/link-card.png is unchanged.');
  } else {
    fs.writeFileSync(CARD_PNG, png);
    console.log(`img/link-card.png ${previous ? 'updated' : 'created'} (${png.length} bytes).`);
  }

  const version = crypto.createHash('sha256').update(png).digest('hex').slice(0, VERSION_LENGTH);
  if (tag[2] === version) {
    console.log(`index.html already names v=${version}, so it is unchanged.`);
  } else {
    fs.writeFileSync(INDEX_HTML, html.replace(OG_IMAGE, `$1${version}$3`));
    console.log(`index.html og:image moved from v=${tag[2]} to v=${version}.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
