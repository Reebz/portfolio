// B6 — Mobile Start menu redesign (Slide-in submenu approach).
//
// Verifies the post-redesign Start menu:
//   - fits within the viewport (no horizontal/vertical overflow)
//   - opens on tap of #start-button
//   - submenus open on tap of a .has-submenu parent (slide-in)
//   - outside-tap on the desktop closes the menu
//   - tapping a leaf launches the window and closes the menu
//
// Runs under iphone-14 and ipad-pro-11 projects (testMatch /mobile-.+/).
// Tablet keeps the native Win98 right-cascade (no slide), so submenu
// assertions check display state rather than transform — they pass for
// both slide-in (phone) and cascade (tablet) approaches.

const { test, expect } = require('@playwright/test');

test.describe('Mobile Start menu (B6)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => sessionStorage.setItem('booted', '1'));
    await page.goto('/');
    await page.waitForTimeout(300);
  });

  test('B6: Start menu fits within viewport when opened', async ({ page }) => {
    const startBtn = page.locator('#start-button');
    await startBtn.dispatchEvent('click');
    await page.waitForTimeout(200);

    const menu = page.locator('#start-menu');
    await expect(menu).toBeVisible();
    const box = await menu.boundingBox();
    expect(box).not.toBeNull();

    const vp = page.viewportSize();
    // Width never exceeds the viewport.
    expect(box.width).toBeLessThanOrEqual(vp.width + 1);
    // Height stays within the viewport (the menu anchors above the taskbar
    // and is capped at 75-80vh per breakpoint).
    expect(box.height).toBeLessThanOrEqual(vp.height + 1);
    // The menu's bottom edge sits within the viewport (not cut off above).
    expect(box.y).toBeGreaterThanOrEqual(0);
  });

  test('B6: Start menu opens on tap and closes on outside tap', async ({ page }) => {
    const startBtn = page.locator('#start-button');
    await startBtn.dispatchEvent('click');
    await page.waitForTimeout(150);
    await expect(page.locator('#start-menu')).toBeVisible();

    // Tap on bare desktop background (top-left area where icons don't live;
    // away from #start-button and #start-menu).
    await page.locator('#desktop').dispatchEvent('click');
    await page.waitForTimeout(200);

    // The menu hides via .open class removal (computed display: none).
    const display = await page.evaluate(() => {
      return getComputedStyle(document.getElementById('start-menu')).display;
    });
    expect(display).toBe('none');
  });

  test('B6: submenu opens on tap of a .has-submenu parent trigger', async ({ page }) => {
    const startBtn = page.locator('#start-button');
    await startBtn.dispatchEvent('click');
    await page.waitForTimeout(150);

    // The "Programs" top-level item is the only .has-submenu child of the
    // .start-menu-items root <ul>. Tap its trigger to expand.
    const programsLi = page.locator('#start-menu > .start-menu-items > .has-submenu').first();
    const programsBtn = programsLi.locator(':scope > [aria-haspopup]');
    await programsBtn.dispatchEvent('click');
    await page.waitForTimeout(250);

    // The parent li should have .submenu-open and aria-expanded="true".
    await expect(programsLi).toHaveClass(/submenu-open/);
    await expect(programsBtn).toHaveAttribute('aria-expanded', 'true');

    // The submenu's actual rendered position must be inside the menu —
    // either visible (slide-in approach: translateX(0)) or display:block
    // (cascade approach). Assert width > 0 and visible.
    const submenu = programsLi.locator(':scope > .start-submenu');
    const subBox = await submenu.boundingBox();
    expect(subBox).not.toBeNull();
    expect(subBox.width).toBeGreaterThan(0);
    expect(subBox.height).toBeGreaterThan(0);
  });

  test('B6: tapping a leaf menu item launches the window and closes the menu', async ({ page }) => {
    const startBtn = page.locator('#start-button');
    await startBtn.dispatchEvent('click');
    await page.waitForTimeout(150);

    // Guestbook is a top-level leaf (no submenu navigation needed).
    const guestbookLeaf = page.locator(
      '#start-menu .start-menu-item[data-window="window-guestbook"]'
    );
    await expect(guestbookLeaf).toBeVisible();
    await guestbookLeaf.dispatchEvent('click');
    await page.waitForTimeout(250);

    // Menu hides (computed display: none after .open class removal).
    const display = await page.evaluate(() => {
      return getComputedStyle(document.getElementById('start-menu')).display;
    });
    expect(display).toBe('none');

    // And the Guestbook window opens.
    await expect(page.locator('#window-guestbook')).toHaveAttribute(
      'data-state',
      'open'
    );
  });
});
