// U4 — Mobile Start menu interaction depth (R7).
//
// Catches the B6 bug class — Start menu layout breaks at narrow viewport,
// submenus stack awkwardly — by walking the full interaction surface and
// asserting the menu + every submenu state stays within viewport bounds.
//
// The implemented design (PR #9, B6 redesign) is the "Slide-in submenu":
//   - #start-menu is position: fixed, width 70vw (clamped 240-320px), max-height 75vh
//   - Submenus are position: absolute inside #start-menu (containing block),
//     left: 24px (preserves Win98 sidebar stripe), right: 0, top: 0, bottom: 0
//   - Off-stage default: transform: translateX(110%)
//   - When parent .has-submenu has .submenu-open: transform: translateX(0) —
//     the submenu COVERS the parent's items area (parent menu chrome stays
//     visible; the parent's <ul> items are visually hidden by the slid-in panel)
//   - A "← <ParentLabel>" affordance is injected by JS as the first child of
//     each .start-submenu (desktop.js:ensureSubmenuBackBar). Tapping it removes
//     .submenu-open from the parent .has-submenu, sliding the submenu back off
//   - Nested submenus (.start-submenu .start-submenu) have left: 0 (cover the
//     full parent submenu) and z-index: 2 (stack above)
//
// Companion to tests/mobile-start-menu.spec.js — that spec covers "menu fits
// viewport + basic close"; this spec covers depth-of-interaction (multi-level
// drill, back affordance, leaf-launches-window, outside-tap-with-submenu-open).
//
// Real-tap discipline per R1: every interaction uses page.tap()/locator.tap()
// — no synthetic-click escape hatches.

const { test, expect } = require('@playwright/test');

// Top-level Programs has nested submenus (Accessories, Games). Used for the
// two-level drill scenario.
const PROGRAMS_LI = '#start-menu > .start-menu-items > .has-submenu';
const PROGRAMS_TRIGGER = `${PROGRAMS_LI} > [aria-haspopup]`;
const PROGRAMS_SUBMENU = `${PROGRAMS_LI} > .start-submenu`;
// Accessories is the first nested .has-submenu under Programs' submenu.
const ACCESSORIES_LI = `${PROGRAMS_SUBMENU} > .has-submenu`;
const ACCESSORIES_TRIGGER = `${ACCESSORIES_LI} > [aria-haspopup]`;
const ACCESSORIES_SUBMENU = `${ACCESSORIES_LI} > .start-submenu`;
const CALCULATOR_LEAF = '#start-menu [data-app="calculator"]';
const BACK_AFFORDANCE = '.has-submenu.submenu-open > .start-submenu > .start-submenu-back';

// 400ms is the safe minimum wait after a .has-submenu trigger tap before any
// further interaction. The Win98 cascading-submenu hover model (desktop.js
// initSubmenus) schedules a 350ms setTimeout(openSubmenu) on every mouseenter.
// Playwright's WebKit mobile emulation synthesizes mouseenter from tap events,
// so the timer fires shortly after a tap. Waiting > 350ms after the trigger
// tap lets that timer fire its idempotent re-add BEFORE the next tap arrives;
// otherwise a back/leaf tap that lands during the pending-timer window gets
// raced by the deferred openSubmenu, reopening the submenu we just closed.
// On a real iPhone this race window is harmless because touchend ends hover.
const SUBMENU_SETTLE_MS = 400;

async function openStartMenu(page) {
  await page.locator('#start-button').tap();
  await page.waitForTimeout(200);
  await expect(page.locator('#start-menu')).toHaveClass(/open/);
}

async function openProgramsSubmenu(page) {
  await page.locator('#start-menu > .start-menu-items > .has-submenu > [aria-haspopup]').first().tap();
  await page.waitForTimeout(SUBMENU_SETTLE_MS);
}

test.describe('Mobile Start menu — interaction depth (R7)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => sessionStorage.setItem('booted', '1'));
    await page.goto('/');
    await page.waitForTimeout(300);
  });

  test('R7: opened menu fits viewport (width ≤ vp.width, height ≤ vp.height * 0.85)', async ({ page }) => {
    await openStartMenu(page);

    const menu = page.locator('#start-menu');
    const box = await menu.boundingBox();
    expect(box).not.toBeNull();

    const vp = page.viewportSize();
    // Width within viewport — the menu must never overflow horizontally.
    expect(box.width).toBeLessThanOrEqual(vp.width);
    // Height capped well below the viewport (75vh per the B6 spec leaves
    // the top quarter for breathing room above the taskbar).
    expect(box.height).toBeLessThanOrEqual(vp.height * 0.85);
    // Left edge inside the viewport.
    expect(box.x).toBeGreaterThanOrEqual(0);
    // Right edge inside the viewport (catches B6: menu sliding past the right edge).
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
  });

  test('R7: submenu opens via tap on Programs trigger (slide-in covers parent items)', async ({ page }) => {
    await openStartMenu(page);

    const parentMenuBoxBefore = await page.locator('#start-menu').boundingBox();
    await openProgramsSubmenu(page);

    // Parent <li> gets .submenu-open + aria-expanded="true".
    await expect(page.locator(PROGRAMS_LI)).toHaveClass(/submenu-open/);
    await expect(page.locator(PROGRAMS_TRIGGER)).toHaveAttribute('aria-expanded', 'true');

    // Submenu rendered: transform translateX(0) (visible) and pointer-events auto.
    const submenuTransform = await page.locator(PROGRAMS_SUBMENU).evaluate(
      el => getComputedStyle(el).transform
    );
    // Off-stage state would be 'matrix(1, 0, 0, 1, <positive translateX>, 0)';
    // on-stage is 'matrix(1, 0, 0, 1, 0, 0)' or 'none'.
    expect(submenuTransform === 'none' || submenuTransform === 'matrix(1, 0, 0, 1, 0, 0)').toBe(true);

    // The parent menu's outer chrome does NOT move — the slide-in design
    // keeps #start-menu in place and slides the submenu IN on top of the
    // parent's items area (preserving the sidebar stripe).
    const parentMenuBoxAfter = await page.locator('#start-menu').boundingBox();
    expect(parentMenuBoxAfter.x).toBeCloseTo(parentMenuBoxBefore.x, 0);
    expect(parentMenuBoxAfter.y).toBeCloseTo(parentMenuBoxBefore.y, 0);
    expect(parentMenuBoxAfter.width).toBeCloseTo(parentMenuBoxBefore.width, 0);

    // The submenu sits INSIDE the parent menu's bounding box (covers parent's
    // item area). Submenu's right edge should not exceed parent menu's right.
    const subBox = await page.locator(PROGRAMS_SUBMENU).boundingBox();
    expect(subBox).not.toBeNull();
    expect(subBox.x + subBox.width).toBeLessThanOrEqual(parentMenuBoxAfter.x + parentMenuBoxAfter.width + 1);
    // And the submenu's left starts at left: 24px (sidebar stripe inset).
    expect(subBox.x).toBeGreaterThanOrEqual(parentMenuBoxAfter.x);

    // Both the parent menu AND the slid-in submenu fit within the viewport.
    const vp = page.viewportSize();
    expect(parentMenuBoxAfter.x + parentMenuBoxAfter.width).toBeLessThanOrEqual(vp.width);
    expect(subBox.x + subBox.width).toBeLessThanOrEqual(vp.width);
  });

  test('R7: ← Back affordance injected and tapping it slides submenu back off-stage', async ({ page }) => {
    await openStartMenu(page);
    await openProgramsSubmenu(page);

    // Back bar is injected as the first child of the open .start-submenu
    // (desktop.js:ensureSubmenuBackBar). Label echoes the parent trigger
    // ("← Programs").
    const backBtn = page.locator(BACK_AFFORDANCE);
    await expect(backBtn).toBeVisible();
    await expect(backBtn).toHaveAttribute('aria-label', /back/i);
    const backText = (await backBtn.textContent()).trim();
    // Contains the back arrow + the parent label ("Programs").
    expect(backText).toMatch(/Programs/);

    // Tap Back — parent .has-submenu loses .submenu-open, parent menu stays open.
    await backBtn.tap();
    await page.waitForTimeout(300);

    await expect(page.locator(PROGRAMS_LI)).not.toHaveClass(/submenu-open/);
    await expect(page.locator(PROGRAMS_TRIGGER)).toHaveAttribute('aria-expanded', 'false');
    // Parent #start-menu remains open so the user can pick another item.
    await expect(page.locator('#start-menu')).toHaveClass(/open/);
  });

  test('R7: two-level submenu drill — Programs → Accessories → Calculator launches window', async ({ page }) => {
    await openStartMenu(page);

    // Level 1: Programs
    await openProgramsSubmenu(page);
    await expect(page.locator(PROGRAMS_LI)).toHaveClass(/submenu-open/);

    // Level 2: Accessories (first nested .has-submenu under Programs).
    const accBtn = page.locator(ACCESSORIES_TRIGGER).first();
    await expect(accBtn).toBeVisible();
    await accBtn.tap();
    await page.waitForTimeout(SUBMENU_SETTLE_MS);
    await expect(page.locator(ACCESSORIES_LI).first()).toHaveClass(/submenu-open/);

    // Nested submenu covers the parent submenu (left: 0, z-index: 2 per CSS).
    // Verify it fits the viewport.
    const accBox = await page.locator(ACCESSORIES_SUBMENU).first().boundingBox();
    expect(accBox).not.toBeNull();
    const vp = page.viewportSize();
    expect(accBox.x + accBox.width).toBeLessThanOrEqual(vp.width);
    expect(accBox.y).toBeGreaterThanOrEqual(0);

    // Both submenus have their own Back bar (injected on first open).
    const allBackBars = page.locator('.has-submenu.submenu-open > .start-submenu > .start-submenu-back');
    // Programs' back AND Accessories' back should both exist while drilled in.
    expect(await allBackBars.count()).toBeGreaterThanOrEqual(2);

    // Leaf: Calculator. Tap launches the app and closes the menu.
    const calc = page.locator(CALCULATOR_LEAF);
    await expect(calc).toBeVisible();
    await calc.tap();
    await page.waitForTimeout(400);

    // Menu hides (.open class removed → computed display: none).
    const menuDisplay = await page.evaluate(
      () => getComputedStyle(document.getElementById('start-menu')).display
    );
    expect(menuDisplay).toBe('none');

    // Calculator window opens.
    await expect(page.locator('#window-calculator')).toHaveAttribute('data-state', 'open');
  });

  test('R7: tapping outside #start-menu while a submenu is open closes everything', async ({ page }) => {
    await openStartMenu(page);
    await openProgramsSubmenu(page);
    await expect(page.locator(PROGRAMS_LI)).toHaveClass(/submenu-open/);

    // Outside-tap on the bare desktop background (top-left corner — well
    // away from any icon, start-button, or menu). The desktop.js
    // handleGlobalClick + the U3 outside-tap submenu closer both fire on
    // taps that don't land in #start-menu or #start-button.
    await page.locator('#desktop').tap({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(250);

    // Menu and submenu both close.
    const state = await page.evaluate(() => ({
      menuOpen: document.getElementById('start-menu').classList.contains('open'),
      programsOpen: document.querySelector('#start-menu > .start-menu-items > .has-submenu')
        .classList.contains('submenu-open'),
      menuDisplay: getComputedStyle(document.getElementById('start-menu')).display,
    }));
    expect(state.menuOpen).toBe(false);
    expect(state.programsOpen).toBe(false);
    expect(state.menuDisplay).toBe('none');
  });

  test('R7: edge — at smallest viewport, menu and slid-in submenu stay within right edge', async ({ page }) => {
    // The smallest phone viewport this project targets is iPhone SE
    // (375 in the U5 plan; Playwright's iPhone SE device profile is 320 —
    // even tighter, so the assertion holds across both). This test runs
    // under every mobile project's viewport via the existing testMatch.
    await openStartMenu(page);
    const vp = page.viewportSize();

    const menuBox = await page.locator('#start-menu').boundingBox();
    expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(vp.width);

    // Drill into Programs → submenu still fits.
    await openProgramsSubmenu(page);
    const subBox = await page.locator(PROGRAMS_SUBMENU).boundingBox();
    expect(subBox.x + subBox.width).toBeLessThanOrEqual(vp.width);

    // Drill into Accessories → nested submenu still fits.
    await page.locator(ACCESSORIES_TRIGGER).first().tap();
    await page.waitForTimeout(SUBMENU_SETTLE_MS);
    const accBox = await page.locator(ACCESSORIES_SUBMENU).first().boundingBox();
    expect(accBox.x + accBox.width).toBeLessThanOrEqual(vp.width);
  });
});
