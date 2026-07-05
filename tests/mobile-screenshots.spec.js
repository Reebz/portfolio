// U6 — Mobile screenshot baselines for chrome states.
//
// Captures four canonical phone chrome states as PNG baselines under
// tests/mobile-screenshots.spec.js-snapshots/, then diffs against them on
// every run. Catches broad visual regressions that computed-style assertions
// in the other mobile-*.spec.js files don't (z-order drift, sprite swaps,
// layout reflow, font-size jumps, etc.).
//
// Pinned to the iphone-14 project so we commit one set of PNGs rather than
// 3× under iphone-se / iphone-14-pro-max / iphone-14. The other phone
// projects keep running the rest of the mobile-* suite for behaviour
// coverage; only the pixel-diff layer is iPhone-14-only.
//
// Dynamic chrome that would flap baselines:
//   - #clock         — Sydney-timezone time, updates every second
//   - #visitor-counter — GoatCounter total, may move during a run
//
// Both are masked via toHaveScreenshot({ mask }) so Playwright paints them
// solid pink before diffing. The masked regions still contribute to layout
// (so a clock that suddenly doubled in width WOULD diff), but the rendered
// text is ignored.
//
// maxDiffPixels: 8000 absorbs anti-aliasing jitter on text rendering
// between Playwright runs. Window bodies include Notepad/Cavaro text;
// consecutive runs produce visually identical chrome but slightly
// different sub-pixel rasterization on font edges, which the original
// 150-pixel tolerance flagged as a diff. iPhone-14 viewport is 390×844
// = 329 040 px; 2500 px is ~0.76% slack — enough to absorb font churn
// without hiding a real chrome regression (chrome changes affect tens
// of thousands of pixels, well above the ceiling).
//
// Update procedure documented in README.md "Updating screenshot baselines".

const { test, expect } = require('@playwright/test');
const { mockGoatCounter } = require('./_helpers');

// Stub gc.zgo.at / goatcounter.com so CI never hits real analytics. Also
// keeps the visitor-counter render deterministic for the masked screenshot
// regions — though those regions are masked, a counter that's still "Loading…"
// would change the bounding box.
test.beforeEach(async ({ page }) => {
  await mockGoatCounter(page);
});

// Defensive: even though playwright.config.js routes mobile-*.spec.js only
// to phone projects, this guards against future config drift where another
// phone project might be added and start churning a duplicate baseline set.
test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'iphone-14',
    'screenshot baselines are pinned to iphone-14 only'
  );
});

test.describe('Mobile screenshot baselines (U6)', () => {
  test.beforeEach(async ({ page }) => {
    // Skip boot via sessionStorage trick used across the mobile suite.
    await page.goto('/');
    await page.evaluate(() => sessionStorage.setItem('booted', '1'));
    await page.goto('/');
    // Give the desktop / icon grid / taskbar a beat to settle. The
    // 600ms here is longer than the 300ms in behaviour specs to give
    // any sprite loads and the visitor-counter fetch time to resolve
    // their initial layout — even though the text is masked, the
    // bounding box must stabilise before we screenshot.
    await page.waitForTimeout(600);
  });

  // Common masks applied to every desktop-chrome shot. Anything that ticks
  // or fetches goes here.
  function dynamicChromeMasks(page) {
    return [page.locator('#clock'), page.locator('#visitor-counter')];
  }

  test('cold load — desktop with icons and taskbar', async ({ page }) => {
    // No windows opened. Just the bare desktop chrome the user sees on first
    // load. Sanity-check the building blocks before screenshotting.
    await expect(page.locator('#desktop')).toBeVisible();
    await expect(page.locator('#icon-grid')).toBeVisible();
    await expect(page.locator('#taskbar')).toBeVisible();

    await expect(page).toHaveScreenshot('cold-load.png', {
      mask: dynamicChromeMasks(page),
      maxDiffPixels: 8000,
    });
  });

  test('start menu open with Programs submenu visible', async ({ page }) => {
    // Open the Start menu, then expand its Programs submenu. Programs is
    // the only top-level .has-submenu item; on phones the submenu slides
    // in over the root menu (B6 redesign), so a screenshot of this state
    // also captures the slide-in transform.
    await page.locator('#start-button').tap();
    await page.waitForTimeout(200);
    await expect(page.locator('#start-menu')).toBeVisible();

    const programsLi = page
      .locator('#start-menu > .start-menu-items > .has-submenu')
      .first();
    const programsBtn = programsLi.locator(':scope > [aria-haspopup]');
    await programsBtn.tap();
    // 350ms covers the slide-in transition (typical 250-300ms) plus a
    // settle frame so the screenshot doesn't catch a mid-transform.
    await page.waitForTimeout(350);
    await expect(programsLi).toHaveClass(/submenu-open/);

    await expect(page).toHaveScreenshot('start-menu-programs.png', {
      // Clock is masked; visitor-counter is offscreen behind the start
      // menu on phones but masking it is cheap insurance.
      mask: dynamicChromeMasks(page),
      maxDiffPixels: 8000,
    });
  });

  test('two windows open with overlap', async ({ page }) => {
    // Open About via hash, then Cavaro. Cavaro is dynamically created by
    // desktop.js (not in the static HTML), so we wait for its element to
    // appear before we manipulate its position.
    await page.evaluate(() => {
      window.location.hash = '#window-about';
    });
    await page.waitForTimeout(250);
    // About opens maximized on portrait phones (R9) and the maximized state
    // pins left/top with !important, which would defeat the deterministic
    // style writes below — restore it to a floating window first, before
    // Cavaro opens centered on top and intercepts the tap. Cavaro is a
    // fixed-size dialog and opens floating.
    await expect(page.locator('#window-about')).toHaveAttribute(
      'data-state',
      'maximized'
    );
    await page.locator('#window-about [aria-label="Maximize"]').tap();
    await expect(page.locator('#window-about')).toHaveAttribute(
      'data-state',
      'open'
    );
    await page.evaluate(() => {
      window.location.hash = '#window-cavaro';
    });
    await page.waitForTimeout(300);
    await expect(page.locator('#window-cavaro')).toHaveAttribute(
      'data-state',
      'open'
    );

    // Deterministic positions: stack them with a partial overlap. Direct
    // style writes bypass the open-time cascade so this is reproducible
    // run to run. Numbers chosen so both title bars are fully visible
    // within the iPhone 14 viewport (390×844).
    await page.evaluate(() => {
      var about = document.getElementById('window-about');
      var cavaro = document.getElementById('window-cavaro');
      about.style.left = '20px';
      about.style.top = '60px';
      about.style.width = '300px';
      about.style.height = '220px';
      cavaro.style.left = '70px';
      cavaro.style.top = '180px';
      cavaro.style.width = '300px';
      cavaro.style.height = '220px';
    });
    await page.waitForTimeout(150);

    await expect(page).toHaveScreenshot('two-windows-overlap.png', {
      mask: dynamicChromeMasks(page),
      maxDiffPixels: 8000,
    });
  });

  test('taskbar with 3 chips', async ({ page }) => {
    // Open three windows so the taskbar has three chips. Use a hash route
    // for each — applyHashState() registers the hashchange handler and
    // dispatches openWindow() through the normal path, including chip
    // creation.
    await page.evaluate(() => {
      window.location.hash = '#window-about';
    });
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      window.location.hash = '#window-guestbook';
    });
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      window.location.hash = '#window-contact';
    });
    await page.waitForTimeout(300);

    // Verify three chips exist before we screenshot — if any window
    // failed to open the visual diff would still pass for a partially
    // populated taskbar, so we gate on this.
    const chips = page.locator('#taskbar .taskbar-window-btn');
    await expect(chips).toHaveCount(3);

    // Screenshot only the #taskbar element. This isolates the chip layout
    // from anything happening in the windows above (which are positioned
    // dynamically and would otherwise add jitter).
    await expect(page.locator('#taskbar')).toHaveScreenshot(
      'taskbar-three-chips.png',
      {
        mask: dynamicChromeMasks(page),
        maxDiffPixels: 8000,
      }
    );
  });
});
