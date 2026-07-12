// U3 (test-coverage plan) — Anti-overflow audit.
//
// Defends against B4 (mobile pan/scroll) and B5 (icons fall below the fold)
// by asserting that every chrome container that *could* overflow does not.
//
//   scrollHeight === clientHeight   →   no scrolled-out content
//
// Containers covered:
//   - #icon-grid (cold load)
//   - #taskbar    (cold load, EXCEPT #taskbar-buttons which is *designed* to
//                  horizontal-scroll when chips overflow — whitelisted)
//   - #start-menu (just-opened, and again after Programs submenu opens)
//   - .window-body (each open window at native size)
//
// Plus the B5 regression guard: every .desktop-icon's bounding-rect bottom
// sits above the taskbar (icon never falls below the fold).
//
// Per R1 we use real page.tap()/locator.tap() — no dispatchEvent.

const { test, expect } = require('@playwright/test');
const { mockGoatCounter } = require('./_helpers');

// Stub gc.zgo.at / goatcounter.com so CI never hits real analytics.
test.beforeEach(async ({ page }) => {
  await mockGoatCounter(page);
});

// Tolerance for sub-pixel rounding when comparing scrollHeight vs clientHeight.
// Mirrors the +1 used in mobile-icons-grid.spec.js so the constant is identical
// across overflow specs.
const PX_TOLERANCE = 1;

test.describe('Mobile — no overflow on chrome containers', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => sessionStorage.setItem('booted', '1'));
    await page.goto('/');
    // Icon-grid children are JS-injected; wait for the full 14 (5 system + 9
    // projects) so computed styles are valid. Same gate as mobile-icons-grid.
    await page.waitForFunction(
      () => document.querySelectorAll('#icon-grid .desktop-icon').length >= 14
    );
    await page.waitForTimeout(150);
  });

  test('R3: #icon-grid scrollHeight === clientHeight after cold load', async ({ page }) => {
    const { scrollHeight, clientHeight } = await page.locator('#icon-grid').evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(scrollHeight).toBeLessThanOrEqual(clientHeight + PX_TOLERANCE);
  });

  test('R3: #taskbar itself does not vertically scroll', async ({ page }) => {
    // #taskbar-buttons IS designed to horizontal-scroll when chips overflow
    // (the B7 fix — see style.css mobile @media #taskbar-buttons overflow-x:
    // auto). Vertical overflow on the taskbar shell still indicates a bug —
    // chrome should fit inside the 44px-ish band.
    const { scrollHeight, clientHeight } = await page.locator('#taskbar').evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(scrollHeight).toBeLessThanOrEqual(clientHeight + PX_TOLERANCE);
  });

  test('R3: #start-menu fits its container when freshly opened', async ({ page }) => {
    await page.locator('#start-button').tap();
    await page.waitForTimeout(200);
    await expect(page.locator('#start-menu')).toBeVisible();

    // #start-menu has overflow: hidden (to clip off-stage slide-in submenus).
    // That means scrollHeight may be larger than clientHeight by design — the
    // assertion at the menu-root level would always pass. The real overflow
    // surface is .start-menu-items, which DOES scroll (overflow-y: auto), but
    // it should still fit its content at first open (no over-tall menu).
    const { scrollHeight, clientHeight } = await page.locator('#start-menu .start-menu-items').evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(scrollHeight).toBeLessThanOrEqual(clientHeight + PX_TOLERANCE);
  });

  test('R3: #start-menu still fits with Programs submenu open', async ({ page }) => {
    await page.locator('#start-button').tap();
    await page.waitForTimeout(200);

    // Open Programs submenu (slide-in approach — submenu absolute-positioned
    // inside #start-menu, sliding in from the right; parent menu doesn't
    // change height, but we audit both surfaces).
    const programsLi = page.locator('#start-menu > .start-menu-items > .has-submenu').first();
    const programsBtn = programsLi.locator(':scope > [aria-haspopup]');
    await programsBtn.tap();
    await page.waitForTimeout(250);

    // Parent menu items list still fits.
    const items = await page.locator('#start-menu .start-menu-items').evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(items.scrollHeight).toBeLessThanOrEqual(items.clientHeight + PX_TOLERANCE);

    // Submenu itself (the now-visible one) does not vertically over-scroll —
    // the Programs submenu has 6 items, well within typical viewport height.
    const submenuMetrics = await programsLi.locator(':scope > .start-submenu').evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(submenuMetrics.scrollHeight).toBeLessThanOrEqual(submenuMetrics.clientHeight + PX_TOLERANCE);
  });

  test('R3: open window-about .window-body does not over-scroll when maximized', async ({ page }) => {
    await page.evaluate(() => { window.location.hash = '#window-about'; });
    await page.waitForTimeout(250);
    // Portrait phones (<480px) open resizable app windows maximized (R9). The
    // outer-window no-double-scroll invariant below must hold in that state too
    // (title bar + flex body; only .window-body scrolls internally).
    await expect(page.locator('#window-about')).toHaveAttribute('data-state', 'maximized');

    // .window-body legitimately has its own internal scroll when content
    // exceeds the window — that's expected app behavior. We assert that the
    // window itself isn't double-scrolling: scrollHeight of the OUTER .window
    // matches clientHeight (the chrome that wraps the body should not scroll).
    const { scrollHeight, clientHeight } = await page.locator('#window-about').evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(scrollHeight).toBeLessThanOrEqual(clientHeight + PX_TOLERANCE);
  });

  // R11 — the big app windows must be usable at 390px: content scrolls or
  // reflows inside the window, and the page itself never scrolls sideways.
  // These windows open MAXIMIZED on portrait phones (R9), so fit is judged in
  // that full-width state. `noHorizontalPageOverflow` reads scrollWidth off the
  // documentElement rather than testing scrollY: html/body are locked to
  // overflow:hidden on mobile, so content wider than the viewport is clipped
  // (not scrollable) yet still a layout bug — scrollWidth exposes it.
  async function noHorizontalPageOverflow(page) {
    const m = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(m.scrollWidth).toBeLessThanOrEqual(m.innerWidth + PX_TOLERANCE);
  }

  async function windowBodyFits(locator) {
    const m = await locator.locator('.window-body').evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(m.scrollWidth).toBeLessThanOrEqual(m.clientWidth + PX_TOLERANCE);
  }

  test('R11: Napster maximized — no page/window-body overflow and the results table reflows inside its wrap', async ({ page }) => {
    await page.evaluate(() => { window.location.hash = '#window-napster'; });
    const napster = page.locator('#window-napster');
    await expect(napster).toHaveAttribute('data-state', 'maximized');
    await page.waitForTimeout(150);

    await noHorizontalPageOverflow(page);
    await windowBodyFits(napster);

    // The 6-column track table collapses to the mobile card stack — each row
    // reflows to fit rather than forcing a sideways scroll inside the results
    // wrap. Guards the card-stack width rule (metadata cells sized to content,
    // not 100% width); without it the four metadata cells flow out to ~1400px.
    const wrap = await napster.locator('.napster-results-wrap').evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(wrap.scrollWidth).toBeLessThanOrEqual(wrap.clientWidth + PX_TOLERANCE);

    // The tab strip fits the window width (no sideways push from the tabs).
    const tabs = await napster.locator('.napster-tabs').evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(tabs.scrollWidth).toBeLessThanOrEqual(tabs.clientWidth + PX_TOLERANCE);
  });

  test('R11: Matrix terminal maximized — no page/window-body overflow during the typing phase', async ({ page }) => {
    // Matrix launches from Start > Run > OK. Run is a fixed-size centered
    // dialog (data-no-resize) that opens 'open', not maximized; OK closes it
    // and opens the maximized terminal.
    await page.locator('#start-button').tap();
    await page.waitForTimeout(200);
    await page.locator('[data-app="run"]').tap();
    await page.waitForTimeout(250);
    await expect(page.locator('#window-run-dialog')).toHaveAttribute('data-state', 'open');
    await page.fill('#run-input', 'neo');
    await page.locator('#window-run-dialog .run-ok-btn').tap();

    const matrix = page.locator('#window-matrix');
    await expect(matrix).toHaveAttribute('data-state', 'maximized');
    // Let the intro type a few glyphs — any nowrap terminal text would push
    // the body wide here, mid-type, before the canvas rain takes over.
    await page.waitForTimeout(400);

    await noHorizontalPageOverflow(page);
    await windowBodyFits(matrix);
  });

  test('R11: Help book maximized — no overflow and pagination controls stay within the viewport', async ({ page }) => {
    await page.evaluate(() => { window.location.hash = '#window-help-book'; });
    const help = page.locator('#window-help-book');
    await expect(help).toHaveAttribute('data-state', 'maximized');
    // Content is lazy-loaded (book.js); wait for the nav to render before
    // measuring.
    await expect(help.locator('#help-next')).toBeVisible();
    await page.waitForTimeout(150);

    await noHorizontalPageOverflow(page);
    await windowBodyFits(help);

    // Both pagination buttons sit fully inside the viewport — the nav row does
    // not push Prev off the left or Next off the right at 390px.
    const nav = await page.evaluate(() => {
      const prev = document.getElementById('help-prev').getBoundingClientRect();
      const next = document.getElementById('help-next').getBoundingClientRect();
      return { prevLeft: prev.left, nextRight: next.right, innerWidth: window.innerWidth };
    });
    expect(nav.prevLeft).toBeGreaterThanOrEqual(-PX_TOLERANCE);
    expect(nav.nextRight).toBeLessThanOrEqual(nav.innerWidth + PX_TOLERANCE);
  });

  test('R5: every .desktop-icon sits above the taskbar (icon-fits-above-fold guard)', async ({ page }) => {
    const viewport = page.viewportSize();
    const taskbarH = await page.locator('#taskbar').boundingBox().then((b) => b.height);
    const visibleMax = viewport.height - taskbarH;
    const iconBottoms = await page.locator('.desktop-icon').evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect().bottom)
    );
    expect(iconBottoms.length).toBeGreaterThan(0);
    iconBottoms.forEach((bottom) => {
      expect(bottom).toBeLessThanOrEqual(visibleMax + PX_TOLERANCE);
    });
  });
});
