// Console-error gate (issue #14).
//
// Catches the silent-failure class of bug: async throws inside event handlers
// that surface only as red console errors. Past escapees include the Matrix
// terminal launcher and Napster click handlers — neither of which would fail
// a behavioural assertion, but both of which would leave a visible error in
// the console of a real user's devtools.
//
// What this spec does:
//   1. Attach a page-level console-error / pageerror listener via
//      attachConsoleGate(page) — see tests/_helpers.js.
//   2. Walk the app through its main launch surfaces:
//        - cold boot
//        - opening + closing every desktop icon
//        - opening every Start menu top-level entry
//        - opening + closing the Matrix terminal (Run > matrix)
//        - opening + closing the Napster window
//   3. Assert the captured error list is empty at the end. Allowlisted noise
//      (GoatCounter, jspaint, third-party iframes) is filtered inside
//      attachConsoleGate so a flake there doesn't mask real bugs.
//
// Runs under the desktop project only — mobile specs already exercise the
// same launch surfaces; this gate's value is one comprehensive walkthrough
// without per-spec console wiring everywhere else.

const { test, expect } = require('@playwright/test');
const {
  mockGoatCounter,
  attachConsoleGate,
  assertConsoleClean,
} = require('./_helpers');

test.beforeEach(async ({ page }) => {
  await mockGoatCounter(page);
});

test.describe('Console error gate', () => {
  test('cold boot to desktop is console-clean', async ({ page }) => {
    const gate = attachConsoleGate(page);

    await page.goto('/');
    await page.evaluate(() => sessionStorage.setItem('booted', '1'));
    await page.goto('/');
    // Give async init (visitor counter, project icon hydration, hashchange
    // routing) a beat to settle so a deferred throw surfaces.
    await page.waitForTimeout(800);

    assertConsoleClean(gate);
  });

  test('opening and closing every desktop icon is console-clean', async ({ page, context }) => {
    const gate = attachConsoleGate(page);

    // Some project icons are link-type (data-url, opens external site via
    // window.open). Block any popups immediately so CI doesn't burn time
    // (or hit network) fetching claudebattery.com / linkedin.com.
    context.on('page', (popup) => {
      // Fire-and-forget — closing immediately is safe; we don't need the
      // popup for any assertion.
      popup.close().catch(() => {});
    });

    await page.goto('/');
    await page.evaluate(() => sessionStorage.setItem('booted', '1'));
    await page.goto('/');
    // Wait until the icon grid has finished hydrating its dynamic children.
    await page.waitForFunction(
      () => document.querySelectorAll('#icon-grid .desktop-icon').length >= 14
    );
    await page.waitForTimeout(150);

    // Collect every icon's data-window-id. Skip any that already have an
    // open window (defensive — none should, but a future spec might
    // sequence things differently).
    const windowIds = await page.locator('#icon-grid [data-window-id]').evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-window-id')).filter(Boolean)
    );
    expect(windowIds.length).toBeGreaterThan(5);

    for (const id of windowIds) {
      const icon = page.locator(`[data-window-id="${id}"]`);
      await icon.dblclick();
      // Some icons launch external links (target=_blank) and never open a
      // window; tolerate either outcome but wait deterministically. We
      // ALSO tolerate dynamic windows (e.g. Cavaro) that take a beat to
      // build their innerHTML.
      await page.waitForTimeout(350);

      const win = page.locator(`#${id}`);
      const winCount = await win.count();
      if (winCount === 0) continue; // external link or unsupported launcher

      const state = await win.getAttribute('data-state').catch(() => null);
      if (state !== 'open' && state !== 'maximized') continue;

      // Close via the title-bar Close button if present, otherwise via the
      // hash-route reset (mirrors how help-book-lazy.spec.js closes things).
      const closeBtn = win.locator('.title-bar [aria-label="Close"]');
      if ((await closeBtn.count()) > 0) {
        await closeBtn.first().click({ force: true });
      } else {
        await page.evaluate(() => { window.location.hash = ''; });
      }
      await page.waitForTimeout(150);
    }

    assertConsoleClean(gate);
  });

  test('opening Matrix terminal and Napster is console-clean', async ({ page }) => {
    // These two apps are explicitly called out in issue #14 as the most
    // common sources of silent async throws. Exercise them in isolation so
    // a regression points at the right module.
    const gate = attachConsoleGate(page);

    await page.goto('/');
    await page.evaluate(() => sessionStorage.setItem('booted', '1'));
    await page.goto('/');
    await page.waitForTimeout(300);

    // Matrix terminal — launched via Start > Run > OK.
    await page.click('#start-button');
    await page.waitForTimeout(200);
    await page.click('[data-app="run"]');
    await page.waitForTimeout(300);
    await expect(page.locator('#window-run-dialog')).toHaveAttribute('data-state', 'open');
    await page.click('#window-run-dialog .run-ok-btn');
    await page.waitForTimeout(600);
    await expect(page.locator('#window-matrix')).toBeVisible();
    // Let the rain animation tick a few frames so any per-frame throw fires.
    await page.waitForTimeout(500);
    await page.click('#window-matrix .title-bar [aria-label="Close"]');
    await page.waitForTimeout(200);

    // Napster — launched via hash deep-link (covered by hash-deep-link.spec.js).
    await page.evaluate(() => { window.location.hash = '#window-napster'; });
    await page.waitForTimeout(500);
    await expect(page.locator('#window-napster')).toHaveAttribute('data-state', 'open');
    // Click into the Napster window body to fire any tab-switch / song-row
    // click handlers, which is where async throws would normally surface.
    const napsterBody = page.locator('#window-napster .window-body');
    if ((await napsterBody.count()) > 0) {
      await napsterBody.click({ position: { x: 20, y: 20 } });
      await page.waitForTimeout(150);
    }
    await page.click('#window-napster .title-bar [aria-label="Close"]');
    await page.waitForTimeout(200);

    assertConsoleClean(gate);
  });

  test('Start menu launchers (Programs submenu apps) are console-clean', async ({ page }) => {
    const gate = attachConsoleGate(page);

    await page.goto('/');
    await page.evaluate(() => sessionStorage.setItem('booted', '1'));
    await page.goto('/');
    await page.waitForTimeout(300);

    // Walk through the Accessories + Games submenu launchers. We don't try
    // every Programs entry — that would slow this gate down without
    // exercising a different code path; the launchers all route through the
    // same openWindow() pipeline.
    //
    // Notepad uses a dynamic id (`window-notepad-${Date.now()}`) since it's
    // transient — every launch creates a new instance. The other three use
    // fixed ids. selector is the locator pattern used to find the open
    // window after launch.
    const launchers = [
      { hover: 'Accessories', app: 'notepad', selector: '[id^="window-notepad"][data-state="open"]' },
      { hover: 'Accessories', app: 'calculator', selector: '#window-calculator' },
      { hover: 'Accessories', app: 'paint', selector: '#window-paint' },
      { hover: 'Games', app: 'minesweeper', selector: '#window-minesweeper' },
    ];

    for (const { hover, app, selector } of launchers) {
      await page.click('#start-button');
      await expect(page.locator('#start-menu')).toHaveClass(/open/);
      await page.hover('[role="menuitem"]:has-text("Programs")');
      await expect(page.locator('.has-submenu.submenu-open .start-submenu').first()).toBeVisible();
      await page.hover(`[role="menuitem"]:has-text("${hover}")`);
      await expect(page.locator(`[data-app="${app}"]`)).toBeVisible();
      await page.click(`[data-app="${app}"]`);
      const win = page.locator(selector).first();
      await expect(win).toHaveAttribute('data-state', 'open');
      const closeBtn = win.locator('.title-bar [aria-label="Close"]');
      if ((await closeBtn.count()) > 0) {
        await closeBtn.first().click({ force: true });
        await page.waitForTimeout(200);
      }
    }

    // Paint iframes jspaint, which logs a WebGL-context warning when the
    // headless GPU can't back it. That's a Chromium-CI environment quirk,
    // not a regression in our code — filter it out before asserting.
    // Allowlist regex `/jspaint/i` in _helpers.js misses this string since
    // the message itself doesn't mention jspaint by name.
    gate.errors = gate.errors.filter((e) => !/Failed to get WebGL context/i.test(e));

    assertConsoleClean(gate);
  });
});
