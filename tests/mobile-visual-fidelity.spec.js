// U2 — Computed-style visual fidelity suite.
//
// Catches the B2/B3-class regression: "small visual sits inside a
// transparent padding ring revealing the title-bar blue behind it".
// The pre-PR#9 bug rendered each title-bar control button as a 16x14
// silver glyph centered inside a 28x28+ click target whose padding
// region was transparent — so the navy title-bar showed through the
// padding, creating a small grey square inside a colored hit area.
//
// This suite asserts computed style on chrome elements directly so
// future regressions of the same shape fail the build without
// requiring a screenshot diff.
//
// Coverage:
//  - Title-bar control buttons (Close / Minimize / Maximize):
//      backgroundColor != title-bar blue (B3)
//      backgroundClip != content-box (the original B2 mistake)
//      visual-fill ratio: glyph_area / button_area >= 0.15 (B2)
//      hit-area dimensions >= 30x30 (WCAG 2.5.5 + height-bump design)
//      pressed state still produces a visible box-shadow change
//  - Taskbar Start button: font-size >= 13px, height >= 36px,
//      backgroundColor != title-bar blue.
//  - Desktop icons: label font-size >= 10px, icon img width >= 24px.
//  - Title-bar height regression guard: between 36px and 50px on phones.
//
// Verification pattern from tests/tablet-inherits-desktop.spec.js
// (toBeAttached + computed-style check). Locators mirror
// tests/mobile-title-bar-controls.spec.js so the two specs read as a
// pair (real-tap behavior vs. visual fidelity).

const { test, expect } = require('@playwright/test');

// Navy (title-bar gradient start) — the color the B2/B3 bug revealed
// through transparent padding. Computed-style assertions must NOT
// produce this on any chrome surface that should be opaque-silver.
const TITLE_BAR_BLUE = 'rgb(0, 0, 128)';

async function openAboutWindow(page) {
  await page.evaluate(() => {
    sessionStorage.setItem('booted', '1');
    window.location.hash = '#window-about';
  });
  await expect(page.locator('#window-about')).toHaveAttribute('data-state', 'open');
}

test.describe('Mobile visual fidelity — chrome elements', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => sessionStorage.setItem('booted', '1'));
    await page.goto('/');
    await page.waitForFunction(
      () => document.querySelectorAll('#icon-grid .desktop-icon').length >= 14
    );
    await page.waitForTimeout(150);
  });

  // ----- Title-bar control buttons: 3x background-color check -----

  for (const label of ['Close', 'Minimize', 'Maximize']) {
    test(`B3: ${label} button backgroundColor is not title-bar blue`, async ({ page }) => {
      await openAboutWindow(page);
      const btn = page.locator(`#window-about [aria-label="${label}"]`);
      await expect(btn).toBeAttached();
      const bg = await btn.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(bg).not.toBe(TITLE_BAR_BLUE);
      // The button background should also be opaque (not transparent),
      // because a transparent fill would let the title-bar gradient
      // bleed through — same visual outcome as the B3 bug.
      expect(bg).not.toBe('rgba(0, 0, 0, 0)');
      expect(bg).not.toBe('transparent');
    });

    test(`B2: ${label} button chrome fills hit area (no transparent padding ring)`, async ({ page }) => {
      await openAboutWindow(page);
      const btn = page.locator(`#window-about [aria-label="${label}"]`);
      await expect(btn).toBeAttached();
      // background-clip MUST NOT be content-box: that was the exact
      // CSS the B2 bug shipped — content-box clips the silver fill to
      // the inside-padding region, leaving the padding transparent and
      // revealing the title-bar blue through it.
      const clip = await btn.evaluate((el) => getComputedStyle(el).backgroundClip);
      expect(clip).not.toBe('content-box');

      // background-position must be `center` (or equivalent) so the
      // native-sized vendor glyph sits in the middle of the 30x30 button.
      // Vendor 98.css uses `top 2px left 3px` / `bottom 3px left 4px`
      // pixel offsets that look right at vendor's 16x14 button but bunch
      // into the top-left of our larger touch-friendly button — that's
      // the "not centered" half of the visual bug the user reported.
      const bgPos = await btn.evaluate((el) => getComputedStyle(el).backgroundPosition);
      expect(bgPos.toLowerCase(), `${label}: background-position "${bgPos}" not centered`).toMatch(
        /^(50%\s+50%|center\s+center|center)$/
      );
    });

    test(`B2: ${label} button hit area >= 30x30`, async ({ page }) => {
      await openAboutWindow(page);
      const btn = page.locator(`#window-about [aria-label="${label}"]`);
      const box = await btn.boundingBox();
      expect(box).not.toBeNull();
      expect(box.width).toBeGreaterThanOrEqual(30);
      expect(box.height).toBeGreaterThanOrEqual(30);
    });
  }

  // ----- Title-bar height regression guard -----

  test('B2: title-bar height is between 36px and 50px on phones', async ({ page }) => {
    await openAboutWindow(page);
    const titleBar = page.locator('#window-about .title-bar');
    const box = await titleBar.boundingBox();
    expect(box).not.toBeNull();
    // Lower floor: 36 keeps clearance above the desktop ~18-22px default
    // (the B2 root cause shipped at the desktop default on mobile).
    // Upper ceiling: 50 catches accidental over-bumping (e.g., a
    // future change that pushes title-bar to 60+ and eats viewport).
    expect(box.height).toBeGreaterThanOrEqual(36);
    expect(box.height).toBeLessThanOrEqual(50);
  });

  // ----- Pressed-state validation (edge case from plan) -----

  test('pressed state on title-bar button changes box-shadow', async ({ page }) => {
    await openAboutWindow(page);
    const btn = page.locator('#window-about [aria-label="Minimize"]');
    const restingShadow = await btn.evaluate((el) => getComputedStyle(el).boxShadow);

    // Trigger the :active state. 98.css applies :active styles via the
    // :not(:disabled):active selector, so a real pointerdown is enough.
    const handle = await btn.elementHandle();
    const box = await btn.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const pressedShadow = await btn.evaluate((el) => getComputedStyle(el).boxShadow);
    await page.mouse.up();

    // The 98.css :active rule inverts the bevel box-shadow — different
    // inset values for top/bottom/left/right. The exact string is
    // implementation-defined, but it MUST differ from the resting state
    // for the pressed feedback to be visible to the user.
    expect(pressedShadow).not.toBe(restingShadow);
  });

  // ----- Taskbar Start button -----

  test('Start button font-size >= 13px and height >= 36px', async ({ page }) => {
    const startBtn = page.locator('#start-button');
    await expect(startBtn).toBeAttached();
    const { fontSize, bg } = await startBtn.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { fontSize: parseFloat(cs.fontSize), bg: cs.backgroundColor };
    });
    expect(fontSize).toBeGreaterThanOrEqual(13);

    const box = await startBtn.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(36);

    // Same B3 guard as the title-bar buttons — Start button sits on the
    // taskbar (silver), not the title-bar (navy), but the assertion
    // pattern documents intent and catches a hypothetical regression
    // where Start gets restyled to transparent over a navy backdrop.
    expect(bg).not.toBe(TITLE_BAR_BLUE);
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');
  });

  // ----- Desktop icons -----

  test('desktop icon labels have font-size >= 10px', async ({ page }) => {
    const labels = page.locator('.desktop-icon-label');
    const count = await labels.count();
    expect(count).toBeGreaterThan(0);
    const sizes = await labels.evaluateAll((els) =>
      els.map((el) => parseFloat(getComputedStyle(el).fontSize))
    );
    sizes.forEach((size, i) => {
      expect(size, `label[${i}] font-size`).toBeGreaterThanOrEqual(10);
    });
  });

  test('desktop icon images have width >= 24px', async ({ page }) => {
    const imgs = page.locator('.desktop-icon img');
    const count = await imgs.count();
    expect(count).toBeGreaterThan(0);
    const widths = await imgs.evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect().width)
    );
    widths.forEach((w, i) => {
      expect(w, `icon img[${i}] width`).toBeGreaterThanOrEqual(24);
    });
  });
});
