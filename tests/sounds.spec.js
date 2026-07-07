// U8 — System sounds + tray speaker toggle.
//
// Audible output can't be automated, so these tests cover the parts that can:
//   1. AE4 (toggle + persistence): the tray speaker flips its aria-pressed /
//      icon state, persists the 'sound-enabled' flag, and restores it on reload.
//   2. Sound calls are console-clean and never throw before any user gesture.
//   3. AE4 (mute silences everything): with sound disabled, opening a
//      dialog-style window creates NO AudioContext — proving playError is a
//      strict no-op when muted (instrumented by counting constructor calls).
//
// Runs under the desktop project (filename isn't `mobile-*`). Boot is skipped
// via the sessionStorage 'booted' flag so the boot POST beep (which builds its
// own AudioContext) can't pollute the constructor counter in test 3.

const { test, expect } = require('@playwright/test');
const {
  mockGoatCounter,
  attachConsoleGate,
  assertConsoleClean,
} = require('./_helpers');

test.beforeEach(async ({ page }) => {
  await mockGoatCounter(page);
});

// Skip the boot sequence and land on the desktop.
async function bootToDesktop(page) {
  await page.goto('/');
  await page.evaluate(() => sessionStorage.setItem('booted', '1'));
  await page.goto('/');
  await page.waitForSelector('#tray-speaker');
}

test.describe('U8 — system sounds + tray speaker toggle', () => {
  test('AE4: tray speaker toggles aria-pressed + icon and persists across reload', async ({ page }) => {
    await bootToDesktop(page);

    const speaker = page.locator('#tray-speaker');
    // Default ENABLED.
    await expect(speaker).toHaveAttribute('aria-pressed', 'true');

    // Mute.
    await speaker.click();
    await expect(speaker).toHaveAttribute('aria-pressed', 'false');
    const persistedOff = await page.evaluate(() => localStorage.getItem('sound-enabled'));
    expect(persistedOff).toBe('0');
    expect(await page.evaluate(() => window.Sounds.isSoundEnabled())).toBe(false);

    // Preference survives a reload (booted flag keeps boot skipped).
    await page.reload();
    await page.waitForSelector('#tray-speaker');
    await expect(page.locator('#tray-speaker')).toHaveAttribute('aria-pressed', 'false');
    expect(await page.evaluate(() => window.Sounds.isSoundEnabled())).toBe(false);

    // Un-mute again and confirm the flag flips back.
    await page.locator('#tray-speaker').click();
    await expect(page.locator('#tray-speaker')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => localStorage.getItem('sound-enabled'))).toBe('1');
  });

  test('sound calls are no-ops before a gesture and stay console-clean', async ({ page }) => {
    const gate = attachConsoleGate(page);
    await bootToDesktop(page);

    // Invoking every play call from page context (not a trusted gesture) must
    // not throw and must not emit console errors — the strict no-op / try-catch
    // contract in sounds.js.
    await page.evaluate(() => {
      window.Sounds.playStartup();
      window.Sounds.playError();
      window.Sounds.playRecycle();
    });
    await page.waitForTimeout(300);

    assertConsoleClean(gate);
  });

  test('AE4: with sound disabled, opening the shutdown dialog creates no AudioContext', async ({ page }) => {
    // Count every AudioContext / webkitAudioContext construction on the page.
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

    await page.goto('/');
    // Skip boot (no POST beep context) AND persist sound OFF before the load
    // that actually wires the desktop.
    await page.evaluate(() => {
      sessionStorage.setItem('booted', '1');
      localStorage.setItem('sound-enabled', '0');
    });
    await page.goto('/');
    await page.waitForSelector('#tray-speaker');

    // Feature must be present and muted (this is what makes the count meaningful).
    expect(await page.evaluate(() => typeof window.Sounds)).toBe('object');
    await expect(page.locator('#tray-speaker')).toHaveAttribute('aria-pressed', 'false');

    // Open the shutdown dialog through the real Start-menu path (fires playError).
    await page.click('#start-button');
    await expect(page.locator('#start-menu')).toHaveClass(/open/);
    await page.click('[data-action="shutdown"]');
    await expect(page.locator('#window-shutdown')).toHaveAttribute('data-state', 'open');
    await page.waitForTimeout(200);

    // Muted playError never touched an AudioContext.
    expect(await page.evaluate(() => window.__acCount)).toBe(0);
  });

  // armStartup arms a one-shot capture listener that lazily builds the
  // AudioContext and plays the chime on the FIRST post-boot gesture, then
  // unbinds itself. Boot is skipped here (no POST beep to pollute the counter),
  // so we arm it directly and drive two synthetic gestures.
  test('armStartup builds the AudioContext once on the first gesture only', async ({ page }) => {
    // Count every AudioContext / webkitAudioContext construction.
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

    await bootToDesktop(page);

    // Sound is enabled by default — that's what makes the chime (and the
    // AudioContext it creates) fire, so the count is meaningful.
    await expect(page.locator('#tray-speaker')).toHaveAttribute('aria-pressed', 'true');
    // Nothing has built a context yet (boot skipped, no play calls in init).
    expect(await page.evaluate(() => window.__acCount)).toBe(0);

    // Arm the one-shot listener (completeBoot does this on the real boot path).
    await page.evaluate(() => window.Sounds.armStartup());

    // First gesture: lazily builds the AudioContext exactly once.
    await page.evaluate(() => document.dispatchEvent(new Event('pointerdown')));
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.__acCount)).toBe(1);

    // One-shot: a second gesture must NOT build another context.
    await page.evaluate(() => document.dispatchEvent(new Event('pointerdown')));
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.__acCount)).toBe(1);
  });
});
