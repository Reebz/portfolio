// The failed-send box on phones.
//
// The box must fit the screen with every button reachable, down to a
// 320-pixel-wide phone, where its buttons wrap onto more rows. A tap on
// Contact behind it raises Contact but leaves the box on top, and its
// title-bar close button closes it. tests/send-error-box.spec.js covers the
// box's behaviour on the desktop.
const { test, expect } = require('@playwright/test');
const { mockGoatCounter, mockFormspree } = require('./_helpers');

const PX_TOLERANCE = 1;

function box(page) {
  return page.locator('#window-send-error');
}

async function bootedPhone(page) {
  await mockGoatCounter(page);
  await page.goto('/');
  await page.evaluate(() => sessionStorage.setItem('booted', '1'));
  await page.goto('/');
  await expect(page.locator('#desktop')).toBeVisible();
}

// Fills Contact, taps Send against a blocked Formspree and waits for the box.
async function failedSend(page) {
  await mockFormspree(page, 'blocked');
  await page.evaluate(() => window.__win98.open('window-contact'));
  await expect(page.locator('#window-contact')).not.toHaveAttribute('data-state', 'closed');
  await page.fill('#contact-from', 'sam@example.com');
  await page.fill('#contact-message', 'Love the Minesweeper!');
  await page.locator('#contact-form button[type="submit"]').tap();
  await expect(box(page)).toBeVisible();
}

async function expectInsideViewport(page, locator) {
  const viewport = page.viewportSize();
  const rect = await locator.boundingBox();
  expect(rect.x).toBeGreaterThanOrEqual(-PX_TOLERANCE);
  expect(rect.y).toBeGreaterThanOrEqual(-PX_TOLERANCE);
  expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width + PX_TOLERANCE);
  expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height + PX_TOLERANCE);
}

async function expectBoxFits(page) {
  await expectInsideViewport(page, box(page));
  const controls = box(page).locator('.send-error-buttons > *');
  await expect(controls).toHaveCount(4);
  for (let i = 0; i < 4; i++) {
    await expect(controls.nth(i)).toBeVisible();
    await expectInsideViewport(page, controls.nth(i));
  }
  const body = await box(page).locator('.window-body').evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(body.scrollWidth).toBeLessThanOrEqual(body.clientWidth + PX_TOLERANCE);
}

test.describe('Mobile failed-send box', () => {
  test.beforeEach(async ({ page }) => {
    await bootedPhone(page);
  });

  test('the box fits the screen with every button visible', async ({ page }) => {
    await failedSend(page);
    await expectBoxFits(page);
  });

  test('on a 320-pixel-wide screen the buttons wrap and still fit', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await failedSend(page);
    await expectBoxFits(page);
    const tops = await box(page).locator('.send-error-buttons > *').evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().top))
    );
    expect(new Set(tops).size).toBeGreaterThan(1);
  });

  test('a tap on Contact behind the box leaves the box on top', async ({ page }) => {
    await failedSend(page);
    const contactTitle = page.locator('#window-contact .title-bar-text');
    await contactTitle.tap();

    const rect = await box(page).boundingBox();
    const onTop = await page.evaluate(({ x, y }) => {
      const hit = document.elementFromPoint(x, y);
      return !!(hit && hit.closest('#window-send-error'));
    }, { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
    expect(onTop).toBe(true);
  });

  test('the title-bar close button closes the box and leaves Contact open', async ({ page }) => {
    await failedSend(page);
    await box(page).locator('.title-bar [aria-label="Close"]').tap();

    await expect(box(page)).toHaveCount(0);
    await expect(page.locator('#window-contact')).not.toHaveAttribute('data-state', 'closed');
    await expect(page.locator('#contact-message')).toHaveValue('Love the Minesweeper!');
  });
});
