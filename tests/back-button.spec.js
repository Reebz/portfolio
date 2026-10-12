// Window addresses and the browser's Back button.
//
// The address bar names the top open window, so a copied address reopens it.
// Windows rewrite that address in place as they open, close, take focus, or
// minimize. That adds no Back steps, so one Back press leaves the site, and
// typed or arriving #window-... addresses open their windows too.
//
// Windows open here through window.__win98.open(id). A location.hash
// assignment adds a Back step by browser design, so only the tests that
// stand in for a typed address use one, and none of those counts history.
const { test, expect } = require('@playwright/test');
const { mockGoatCounter } = require('./_helpers');

// Arrive from another page with the boot sequence skipped. about:blank
// stands in for the LinkedIn post that sent the visitor here.
async function arriveFromAnotherPage(page) {
  await mockGoatCounter(page);
  await page.goto('/');
  await page.evaluate(() => sessionStorage.setItem('booted', '1'));
  await page.goto('about:blank');
  await page.goto('/');
  await expect(page.locator('#desktop')).toBeVisible();
}

async function openWindow(page, id) {
  await page.evaluate((winId) => window.__win98.open(winId), id);
  await expect(page.locator('#' + id)).toHaveAttribute('data-state', 'open');
}

function historyLength(page) {
  return page.evaluate(() => history.length);
}

function hash(page) {
  return page.evaluate(() => location.hash);
}

function address(page) {
  return page.evaluate(() => location.href);
}

test.describe('Back button and window addresses', () => {
  test('AE1: opening and closing windows adds no Back steps', async ({ page }) => {
    await arriveFromAnotherPage(page);
    const before = await historyLength(page);

    await openWindow(page, 'window-about');
    await openWindow(page, 'window-contact');
    await page.locator('#window-contact [aria-label="Close"]').click();
    await expect(page.locator('#window-contact')).toHaveAttribute('data-state', 'closed');

    expect(await historyLength(page)).toBe(before);
  });

  test('AE1: after opening and closing windows, one Back press leaves the site', async ({ page }) => {
    await arriveFromAnotherPage(page);

    await openWindow(page, 'window-about');
    await openWindow(page, 'window-contact');
    await page.locator('#window-contact [aria-label="Close"]').click();
    await expect(page.locator('#window-contact')).toHaveAttribute('data-state', 'closed');

    await page.goBack();
    await expect(page).toHaveURL('about:blank');
  });

  test('AE2: the address follows the top window, and a copied address reopens it', async ({ page, context }) => {
    await arriveFromAnotherPage(page);
    await openWindow(page, 'window-guestbook');
    await openWindow(page, 'window-about');

    // A title-bar click raises the Guestbook without opening anything.
    await page.locator('#window-guestbook .title-bar-text').click();
    await expect.poll(() => hash(page)).toBe('#window-guestbook');

    const copied = await address(page);
    const tab = await context.newPage();
    await mockGoatCounter(tab);
    await tab.goto(copied);
    await expect(tab.locator('#window-guestbook')).toHaveAttribute('data-state', 'open');
  });

  test('minimizing moves the address to the next window, then clears it', async ({ page }) => {
    await arriveFromAnotherPage(page);
    await openWindow(page, 'window-guestbook');
    await openWindow(page, 'window-about');

    await page.locator('#window-about [aria-label="Minimize"]').click();
    await expect(page.locator('#window-about')).toHaveAttribute('data-state', 'minimized');
    await expect.poll(() => hash(page)).toBe('#window-guestbook');

    await page.locator('#window-guestbook [aria-label="Minimize"]').click();
    await expect(page.locator('#window-guestbook')).toHaveAttribute('data-state', 'minimized');
    await expect.poll(() => address(page)).not.toContain('#');
  });

  test('closing the last window clears the address and adds no Back steps', async ({ page }) => {
    await arriveFromAnotherPage(page);
    const before = await historyLength(page);

    await openWindow(page, 'window-about');
    await page.locator('#window-about [aria-label="Close"]').click();
    await expect(page.locator('#window-about')).toHaveAttribute('data-state', 'closed');

    await expect.poll(() => address(page)).not.toContain('#');
    expect(await historyLength(page)).toBe(before);
  });

  test('Back from a typed address keeps its window open and names it again', async ({ page }) => {
    await arriveFromAnotherPage(page);
    // A same-document navigation, like a typed address, adds one Back step.
    await page.evaluate(() => { location.hash = '#window-guestbook'; });
    await expect(page.locator('#window-guestbook')).toHaveAttribute('data-state', 'open');

    await page.goBack();
    await expect.poll(() => hash(page)).toBe('#window-guestbook');
    await expect(page.locator('#window-guestbook')).toHaveAttribute('data-state', 'open');
  });

  test('a window raised while a typed address waits does not overwrite it', async ({ page }) => {
    await arriveFromAnotherPage(page);
    await openWindow(page, 'window-about');

    // The address router waits 100 ms after a hashchange before it reads the
    // address. About is raised 20 ms into that wait.
    await page.evaluate(() => new Promise((resolve) => {
      location.hash = '#window-guestbook';
      setTimeout(() => { window.__win98.open('window-about'); resolve(); }, 20);
    }));

    await expect(page.locator('#window-guestbook')).toHaveAttribute('data-state', 'open');
    await expect.poll(() => hash(page)).toBe('#window-guestbook');
  });

  test('a BSOD reboot replays the boot even when its key also switches windows', async ({ page }) => {
    await arriveFromAnotherPage(page);
    await openWindow(page, 'window-guestbook');
    await openWindow(page, 'window-about');
    // Chromium and WebKit fix the reload's address when reload() runs, so the
    // boot replays here either way. The address the old page unloads with
    // shows whether anything wrote one back after the reboot stripped it.
    await page.evaluate(() => {
      window.addEventListener('pagehide', () => sessionStorage.setItem('unload-address', location.href));
    });

    // The reboot listeners bind after a 60 ms defer, and Ctrl goes down before
    // that. The one F6 keydown then reboots first, from a capture listener,
    // and switches windows second, in the same dispatch.
    await page.keyboard.down('Control');
    await page.evaluate(() => window.__showBsod());
    await expect(page.locator('#bsod-overlay')).toBeVisible();
    await page.waitForTimeout(120);
    await page.keyboard.press('F6');
    await page.keyboard.up('Control');

    await expect(page.locator('#boot-overlay')).toBeVisible({ timeout: 6000 });
    expect(await page.evaluate(() => sessionStorage.getItem('unload-address'))).toMatch(/^[^#]+$/);
  });

  // WebKit throws a SecurityError once replaceState passes its rate limit.
  async function refuseAddressWrites(page) {
    await page.evaluate(() => {
      history.replaceState = () => { throw new DOMException('rate limited', 'SecurityError'); };
    });
  }

  test('a refused address write still opens and closes windows', async ({ page }) => {
    await arriveFromAnotherPage(page);
    await refuseAddressWrites(page);

    await openWindow(page, 'window-about');
    await expect(page.locator('.taskbar-window-btn[data-window-id="window-about"]')).toBeVisible();
    await page.locator('#window-about .title-bar [aria-label="Close"]').click();
    await expect(page.locator('#window-about')).toHaveAttribute('data-state', 'closed');
  });

  test('a BSOD reboot still reloads when the address write is refused', async ({ page }) => {
    await arriveFromAnotherPage(page);
    await openWindow(page, 'window-about');
    await refuseAddressWrites(page);

    await page.evaluate(() => window.__showBsod());
    await expect(page.locator('#bsod-overlay')).toBeVisible();
    // The reboot listeners bind after a 60 ms defer.
    await page.waitForTimeout(120);
    const reloaded = page.waitForEvent('load', { timeout: 5000 });
    await page.keyboard.press('Enter');
    await reloaded;
    await expect(page.locator('#bsod-overlay')).toBeHidden();
  });
});
