// Smoke coverage for the 2026-07-11 enhancement batch: MS-DOS Prompt, Display
// Properties (desktop themes), the BSOD easter egg, the idle screensaver, and
// the Clippy office assistant. Runs under the desktop project (no mobile-/
// tablet- prefix). Smoke-level per the "fun > perfection" project mantra.
const { test, expect } = require('@playwright/test');
const { mockGoatCounter } = require('./_helpers');

// Boot is skipped when a hash is present or 'booted' is seeded; both paths are
// used below so the desktop is interactive immediately.
async function bootedDesktop(page) {
  await mockGoatCounter(page);
  await page.goto('/');
  await page.evaluate(() => sessionStorage.setItem('booted', '1'));
  await page.goto('/');
  await expect(page.locator('#desktop')).toBeVisible();
}

test.describe('MS-DOS Prompt', () => {
  test('opens from a hash deep-link and runs commands', async ({ page }) => {
    await mockGoatCounter(page);
    await page.goto('/#window-dos');
    await expect(page.locator('#window-dos')).toHaveAttribute('data-state', 'open');
    const input = page.locator('#dos-input');
    await expect(input).toBeVisible();

    // DIR lists the virtual filesystem.
    await input.fill('dir');
    await input.press('Enter');
    await expect(page.locator('#dos-output')).toContainText('RESUME');
    await expect(page.locator('#dos-output')).toContainText('file(s)');

    // TYPE prints real content.
    await input.fill('type resume.txt');
    await input.press('Enter');
    await expect(page.locator('#dos-output')).toContainText('Mitch Ribar');

    // Unknown command errors authentically.
    await input.fill('frobnicate');
    await input.press('Enter');
    await expect(page.locator('#dos-output')).toContainText('Bad command or file name');
  });

  test('relaunch after close re-wires cleanly', async ({ page }) => {
    await bootedDesktop(page);
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.__win98.launch('dos'));
      await expect(page.locator('#window-dos')).toHaveAttribute('data-state', 'open');
      await page.locator('#window-dos .title-bar [aria-label="Close"]').click();
      await expect(page.locator('#window-dos')).toHaveAttribute('data-state', 'closed');
    }
    // A fourth open still accepts input (no stacked/duplicate wiring).
    await page.evaluate(() => window.__win98.launch('dos'));
    const input = page.locator('#dos-input');
    await input.fill('ver');
    await input.press('Enter');
    await expect(page.locator('#dos-output')).toContainText('Version 4.10.1998');
  });

  test('CRASH command triggers the BSOD', async ({ page }) => {
    await mockGoatCounter(page);
    await page.goto('/#window-dos');
    const input = page.locator('#dos-input');
    await input.fill('crash');
    await input.press('Enter');
    await expect(page.locator('#bsod-overlay')).toBeVisible();
  });
});

test.describe('BSOD easter egg', () => {
  test('shows and is dismissed by any key', async ({ page }) => {
    await bootedDesktop(page);
    await page.evaluate(() => window.__showBsod());
    await expect(page.locator('#bsod-overlay')).toBeVisible();
    await expect(page.locator('#bsod-overlay')).toContainText('fatal exception');
    // Listeners bind after a short defer; wait past it then press a key.
    await page.waitForTimeout(120);
    await page.keyboard.press('Escape');
    await expect(page.locator('#bsod-overlay')).toHaveCount(0);
  });
});

test.describe('Idle screensaver', () => {
  test('appears on trigger and any input dismisses it', async ({ page }) => {
    await bootedDesktop(page);
    await page.evaluate(() => window.__triggerScreensaver());
    await expect(page.locator('#screensaver-overlay')).toBeVisible();
    await page.mouse.move(200, 200);
    await page.mouse.down();
    await page.mouse.up();
    await expect(page.locator('#screensaver-overlay')).toHaveCount(0);
  });
});

test.describe('Display Properties (themes)', () => {
  test('default desktop has no theme attribute', async ({ page }) => {
    await bootedDesktop(page);
    await expect(page.locator('body')).not.toHaveAttribute('data-theme', /.*/);
  });

  test('OK commits the scheme to the desktop and persists it', async ({ page }) => {
    await bootedDesktop(page);
    await page.evaluate(() => window.__win98.launch('displayProperties'));
    await expect(page.locator('#window-display-properties')).toHaveAttribute('data-state', 'open');

    // Selecting only previews in the monitor thumbnail — the desktop is
    // untouched until OK/Apply (the authentic Win98 behavior).
    await page.locator('#dispprop-scheme').selectOption('hotdog');
    await expect(page.locator('.dispprop-screen')).toHaveAttribute('data-theme', 'hotdog');
    await expect(page.locator('body')).not.toHaveAttribute('data-theme', /.*/);

    await page.locator('#dispprop-ok').click();
    // Transient window is torn down on close.
    await expect(page.locator('#window-display-properties')).toHaveCount(0);
    await expect(page.locator('body')).toHaveAttribute('data-theme', 'hotdog');

    // Persisted choice re-applies on the next load.
    await page.goto('/');
    await page.evaluate(() => sessionStorage.setItem('booted', '1'));
    await page.goto('/');
    await expect(page.locator('body')).toHaveAttribute('data-theme', 'hotdog');
  });

  test('Cancel and Escape never change the committed desktop scheme', async ({ page }) => {
    await bootedDesktop(page);
    // Commit hotdog first.
    await page.evaluate(() => window.__win98.launch('displayProperties'));
    await page.locator('#dispprop-scheme').selectOption('hotdog');
    await page.locator('#dispprop-apply').click();
    await expect(page.locator('body')).toHaveAttribute('data-theme', 'hotdog');

    // Preview a different scheme, then Cancel — desktop must stay hotdog.
    await page.locator('#dispprop-scheme').selectOption('eggplant');
    await page.locator('#dispprop-cancel').click();
    await expect(page.locator('body')).toHaveAttribute('data-theme', 'hotdog');

    // Reopen, preview again, dismiss with Escape — still hotdog, no divergence.
    await page.evaluate(() => window.__win98.launch('displayProperties'));
    await page.locator('#dispprop-scheme').selectOption('rose');
    await page.keyboard.press('Escape');
    await expect(page.locator('#window-display-properties')).toHaveCount(0);
    await expect(page.locator('body')).toHaveAttribute('data-theme', 'hotdog');
  });
});

test.describe('Clippy office assistant', () => {
  test('appears, guides to a window, and dismissal persists', async ({ page }) => {
    await bootedDesktop(page);
    await page.evaluate(() => window.__initClippy());
    await expect(page.locator('#clippy')).toBeVisible();

    // Advance through the tips; one of them opens the About window.
    await page.locator('#clippy .clippy-action').click(); // "Sure"
    await page.locator('#clippy .clippy-action').click(); // "Next"
    await page.locator('#clippy .clippy-action').click(); // "Meet Mitch" -> about
    await expect(page.locator('#window-about')).toHaveAttribute('data-state', 'open');

    // Dismiss and confirm it does not reappear once dismissed.
    await page.locator('#clippy .clippy-close').click();
    await expect(page.locator('#clippy')).toHaveCount(0);
    await page.evaluate(() => window.__initClippy());
    await expect(page.locator('#clippy')).toHaveCount(0);
  });
});

test.describe('Run dialog command parsing', () => {
  async function openRun(page) {
    await page.locator('#start-button').click();
    await page.locator('[data-app="run"]').click();
    await expect(page.locator('#window-run-dialog')).toHaveAttribute('data-state', 'open');
  }

  test('cmd opens the real MS-DOS Prompt (not the Matrix)', async ({ page }) => {
    await bootedDesktop(page);
    await openRun(page);
    await page.fill('#run-input', 'cmd');
    await page.locator('#window-run-dialog .run-ok-btn').click();
    await expect(page.locator('#window-dos')).toHaveAttribute('data-state', 'open');
    await expect(page.locator('#window-matrix')).toHaveCount(0);
  });

  test('neo opens the Matrix terminal', async ({ page }) => {
    await bootedDesktop(page);
    await openRun(page);
    await page.fill('#run-input', 'neo');
    await page.locator('#window-run-dialog .run-ok-btn').click();
    await expect(page.locator('#window-matrix')).toBeVisible();
  });

  test('unknown command shows an error and keeps the dialog open', async ({ page }) => {
    await bootedDesktop(page);
    await openRun(page);
    await page.fill('#run-input', 'wordperfect');
    await page.locator('#window-run-dialog .run-ok-btn').click();
    await expect(page.locator('#run-error')).toBeVisible();
    await expect(page.locator('#window-run-dialog')).toHaveAttribute('data-state', 'open');
  });
});

test.describe('Cavaro icon timed self-destruct', () => {
  // Seed cavaro-dismissed to a timestamp `hoursAgo` in the past (null clears it),
  // reload, and return the Cavaro desktop icon locator.
  async function loadWithDismissal(page, hoursAgo) {
    await mockGoatCounter(page);
    await page.goto('/');
    await page.evaluate((h) => {
      sessionStorage.setItem('booted', '1');
      if (h === null) localStorage.removeItem('cavaro-dismissed');
      else localStorage.setItem('cavaro-dismissed', String(Date.now() - h * 3600 * 1000));
    }, hoursAgo);
    await page.goto('/');
    await expect(page.locator('#desktop')).toBeVisible();
    return page.locator('[data-window-id="window-cavaro"]');
  }

  test('hidden right after dismissal, returns after the 6h window', async ({ page }) => {
    await expect(await loadWithDismissal(page, null)).toBeVisible(); // never dismissed
    await expect(await loadWithDismissal(page, 0)).toBeHidden();     // just dismissed
    await expect(await loadWithDismissal(page, 5)).toBeHidden();     // within window
    await expect(await loadWithDismissal(page, 7)).toBeVisible();    // past window -> returns
  });
});
