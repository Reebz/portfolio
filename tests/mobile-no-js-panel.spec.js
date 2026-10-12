// The no-JavaScript panel on phones.
//
// tests/no-js-panel.spec.js checks what the panel says. This spec checks that
// it fits each iPhone screen with JavaScript off, upright and on its side. On
// its side a phone screen is short, and where the window runs out of room the
// project list scrolls inside it while the name, the role line, and the email
// stay in view above it.
const { test, expect, devices } = require('@playwright/test');
const { mockGoatCounter } = require('./_helpers');

const ROLE_LINE = 'AI products, growth systems & software';

// Each phone project's landscape viewport, from Playwright's matching
// "<device> landscape" descriptor.
const LANDSCAPE = {
  'iphone-se': devices['iPhone SE landscape'].viewport,
  'iphone-14': devices['iPhone 14 landscape'].viewport,
  'iphone-14-pro-max': devices['iPhone 14 Pro Max landscape'].viewport,
};

test.use({ javaScriptEnabled: false });

test.beforeEach(async ({ page }) => {
  await mockGoatCounter(page);
});

async function expectInsideViewport(page, locator) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box, 'the panel has a box').not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

// The name, the role line, and the email, which sit above the project list.
function identity(panel) {
  return [
    panel.locator('h1'),
    panel.getByText(ROLE_LINE, { exact: true }),
    panel.locator('a[href^="mailto:"]'),
  ];
}

test('portrait: the panel sits inside the viewport', async ({ page }) => {
  await page.goto('/');
  const panel = page.locator('#nojs');
  await expect(panel).toBeVisible();
  await expectInsideViewport(page, panel);
});

test('landscape: the panel sits inside the viewport, and the project list scrolls under the name, the role line, and the email', async ({ page }, testInfo) => {
  const landscape = LANDSCAPE[testInfo.project.name];
  expect(landscape, `a landscape viewport for ${testInfo.project.name}`).toBeTruthy();
  await page.setViewportSize(landscape);
  await page.goto('/');

  const panel = page.locator('#nojs');
  await expect(panel).toBeVisible();
  await expectInsideViewport(page, panel);

  for (const item of identity(panel)) await expect(item).toBeInViewport({ ratio: 1 });

  // Bring the end of the project list into view. Where the window runs out
  // of room, as it does on the 14 Pro Max, this scrolls the list. Where the
  // whole window fits, nothing moves. Either way the name, the role line,
  // and the email must stay fully in view.
  const end = panel.locator('.nojs-projects > :last-child');
  await end.scrollIntoViewIfNeeded();
  await expect(end).toBeInViewport({ ratio: 1 });
  for (const item of identity(panel)) await expect(item).toBeInViewport({ ratio: 1 });
  await expectInsideViewport(page, panel);
});

// A phone on its side often fits the whole window, so this shorter screen
// makes the list scroll on every run, whatever a platform's fonts do.
test('a screen too short for the window scrolls the project list under the name, the role line, and the email', async ({ page }, testInfo) => {
  const landscape = LANDSCAPE[testInfo.project.name];
  expect(landscape, `a landscape viewport for ${testInfo.project.name}`).toBeTruthy();
  await page.setViewportSize({ width: landscape.width, height: 240 });
  await page.goto('/');

  const panel = page.locator('#nojs');
  await expect(panel).toBeVisible();
  await expectInsideViewport(page, panel);

  const end = panel.locator('.nojs-projects > :last-child');
  await expect(end).not.toBeInViewport();
  await end.scrollIntoViewIfNeeded();
  await expect(end).toBeInViewport({ ratio: 1 });
  for (const item of identity(panel)) await expect(item).toBeInViewport({ ratio: 1 });
  await expectInsideViewport(page, panel);
});
