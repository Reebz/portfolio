// The no-JavaScript panel.
//
// Scripts draw the whole desktop, so with JavaScript off the page used to stay
// black. index.html now holds one hand-written Win98 window in a <noscript>:
// Mitch's name, the role line, his email, and every desktop project with its
// description and its link. Crawlers that skip scripts read the same text in
// the page source. With JavaScript on, the browser reads noscript content as
// plain text, so the window adds no elements and moves no pixel.
//
// The window's project list is written by hand. The guard below parses the
// PROJECTS literal from desktop.js on disk and fails when the two drift apart.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, expect } = require('@playwright/test');
const { mockGoatCounter } = require('./_helpers');

const NAME = 'Mitch Ribar';
const ROLE_LINE = 'AI products, growth systems & software';
const EMAIL = 'mitch@ribar.ai';
const DESKTOP_JS = path.join(__dirname, '..', 'desktop.js');

// PROJECTS as desktop.js declares it. The literal ends at the first "];"
// after its opening bracket that closes an array JavaScript can parse.
function readProjects() {
  const source = fs.readFileSync(DESKTOP_JS, 'utf8');
  const start = source.indexOf('var PROJECTS = [');
  expect(start, 'desktop.js declares var PROJECTS = [').toBeGreaterThan(-1);
  const open = source.indexOf('[', start);
  for (let close = source.indexOf('];', open); close !== -1; close = source.indexOf('];', close + 1)) {
    try {
      return JSON.parse(JSON.stringify(vm.runInNewContext(source.slice(open, close + 1))));
    } catch (e) {
      // That "];" sat inside the literal, so try the next one.
    }
  }
  throw new Error('Could not parse the PROJECTS literal in desktop.js');
}

// The panel's projects in page order: each <dt> holds a title, linked when
// the project has a URL, and the <dd> after it holds the description.
function panelProjects(page) {
  return page.locator('#nojs dt').evaluateAll((terms) =>
    terms.map((dt) => {
      const link = dt.querySelector('a');
      const dd = dt.nextElementSibling;
      return {
        title: dt.textContent.trim(),
        description: dd && dd.tagName === 'DD' ? dd.textContent.trim() : null,
        url: link ? link.getAttribute('href') : null,
      };
    })
  );
}

test.beforeEach(async ({ page }) => {
  await mockGoatCounter(page);
});

test.describe('With JavaScript off at 1280x800', () => {
  test.use({ javaScriptEnabled: false, viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('AE4: one Win98 window on the black screen gives the name, the role line, and the email', async ({ page }) => {
    const panel = page.locator('#nojs');
    await expect(panel).toBeVisible();
    await expect(panel).toBeInViewport({ ratio: 1 });
    await expect(page.locator('.window:visible')).toHaveCount(1);
    await expect(panel).toHaveClass(/\bwindow\b/);
    // 98.css paints .window silver, and the body stays black because the
    // boot script that clears the booting class never runs.
    await expect(panel).toHaveCSS('background-color', 'rgb(192, 192, 192)');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(0, 0, 0)');

    await expect(panel.locator('h1')).toHaveText(NAME);
    await expect(panel.getByText(ROLE_LINE, { exact: true })).toBeVisible();
    await expect(panel.locator(`a[href="mailto:${EMAIL}"]`)).toHaveText(EMAIL);
  });

  test('R8, R10: the panel lists every PROJECTS entry in desktop.js, linked exactly where it has a URL', async ({ page }) => {
    const projects = readProjects().map(({ title, description, url }) => ({ title, description, url }));
    expect(await panelProjects(page)).toEqual(projects);

    // Project links open in a new tab with noopener, like the desktop's
    // link icons.
    const links = page.locator('#nojs dt a');
    await expect(links).toHaveCount(projects.filter((p) => p.url).length);
    for (const link of await links.all()) {
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', 'noopener');
    }
  });
});

test('R17: with JavaScript on, the noscript holds no elements and the page keeps the windows and links of a page without it', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('booted', '1'));

  async function load() {
    await page.goto('/');
    await page.waitForFunction(() => document.querySelectorAll('#icon-grid .desktop-icon').length >= 13);
    return page.evaluate(() => ({
      noscriptChildren: Array.from(document.querySelectorAll('noscript'), (n) => n.childElementCount),
      windows: document.querySelectorAll('.window').length,
      links: document.querySelectorAll('a').length,
    }));
  }

  const withPanel = await load();
  expect(withPanel.noscriptChildren).toEqual([0]);

  // Serve the same page with its noscript block cut out.
  let cut = false;
  await page.route('/', async (route) => {
    const html = await (await route.fetch()).text();
    const body = html.replace(/\s*<noscript>[\s\S]*?<\/noscript>/, '');
    cut = body !== html;
    await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
  });
  const withoutPanel = await load();
  expect(cut, 'the route cut a noscript block out of index.html').toBe(true);
  expect(withoutPanel.noscriptChildren).toEqual([]);

  expect({ windows: withPanel.windows, links: withPanel.links })
    .toEqual({ windows: withoutPanel.windows, links: withoutPanel.links });
});

test('R9: a raw request for / carries the name, the email, and every project title inside the panel', async ({ request }) => {
  const html = await (await request.get('/')).text();
  const panel = (html.match(/<noscript>[\s\S]*?<\/noscript>/g) || []).find((block) => block.includes('id="nojs"'));
  expect(panel, 'index.html holds the panel in a <noscript>').toBeTruthy();
  for (const text of [NAME, EMAIL, ...readProjects().map((p) => p.title)]) {
    expect(panel, text).toContain(text);
  }
});
