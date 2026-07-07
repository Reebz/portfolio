// U9 — iOS auto-zoom prevention on input focus.
//
// Covers U4's text-floor rules: every input/textarea/[contenteditable]
// inside .window-body computes to font-size ≥ 16px and font-family Tahoma
// when measured under the touch media query — the !important rule beats
// the inline `style="font-size:11px"` on Contact form fields (index.html
// :133/137/141/145). iOS Safari triggers auto-zoom-on-focus when computed
// font-size is below 16; the !important ensures we stay above the floor.
//
// Playwright's Chromium/WebKit emulation doesn't fully simulate iOS auto-
// zoom — the font-size assertion is the durable signal.

const { test, expect } = require('@playwright/test');

test.describe('iOS auto-zoom prevention', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => sessionStorage.setItem('booted', '1'));
    await page.goto('/');
    await page.waitForTimeout(300);
  });

  test('U4: Contact form email input computes to ≥16px Tahoma', async ({ page }) => {
    // Open Contact via hash deep-link.
    await page.evaluate(() => { window.location.hash = '#window-contact'; });
    await page.waitForTimeout(200);
    // R9: Contact is in MAXIMIZE_DEFAULT — opens maximized on a portrait phone.
    // The font-size floor is a computed-style property of the input, unchanged
    // by whether its window floats or fills the viewport.
    await expect(page.locator('#window-contact')).toHaveAttribute('data-state', 'maximized');

    const input = page.locator('#contact-from');
    await expect(input).toBeVisible();
    await input.focus();

    const style = await input.evaluate((el) => {
      var cs = getComputedStyle(el);
      return {
        fontSize: parseFloat(cs.fontSize),
        fontFamily: cs.fontFamily,
      };
    });
    expect(style.fontSize).toBeGreaterThanOrEqual(16);
    expect(style.fontFamily.toLowerCase()).toContain('tahoma');
  });

  test('U4: Contact form textarea computes to ≥16px Tahoma', async ({ page }) => {
    await page.evaluate(() => { window.location.hash = '#window-contact'; });
    await page.waitForTimeout(200);
    const textarea = page.locator('#contact-message');
    await expect(textarea).toBeVisible();
    await textarea.focus();

    const style = await textarea.evaluate((el) => {
      var cs = getComputedStyle(el);
      return {
        fontSize: parseFloat(cs.fontSize),
        fontFamily: cs.fontFamily,
      };
    });
    expect(style.fontSize).toBeGreaterThanOrEqual(16);
    expect(style.fontFamily.toLowerCase()).toContain('tahoma');
  });

  test('U4: visualViewport scale stays at 1 after focusing an input', async ({ page }) => {
    await page.evaluate(() => { window.location.hash = '#window-contact'; });
    await page.waitForTimeout(200);
    const input = page.locator('#contact-from');
    await input.focus();
    await page.waitForTimeout(100);

    // Best-effort check — Playwright emulation doesn't fire real iOS
    // auto-zoom, but if the computed font-size floor held, visualViewport
    // should stay at 1 across browsers too. Tolerate small float drift.
    const scale = await page.evaluate(() => window.visualViewport ? window.visualViewport.scale : 1);
    expect(scale).toBeGreaterThanOrEqual(0.99);
    expect(scale).toBeLessThanOrEqual(1.01);
  });
});
