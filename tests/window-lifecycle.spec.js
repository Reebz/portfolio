const { test, expect } = require('@playwright/test');
const { mockGoatCounter } = require('./_helpers');

// Stub gc.zgo.at / goatcounter.com before any spec touches the page so CI
// never makes real analytics requests. See tests/_helpers.js for context.
test.beforeEach(async ({ page }) => {
  await mockGoatCounter(page);
});

const BOOTED = async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => sessionStorage.setItem('booted', '1'));
  await page.goto('/');
  await page.waitForTimeout(300);
};

test.describe('Window drag, resize, z-index', () => {
  test.beforeEach(BOOTED);

  test('window can be dragged by its title bar', async ({ page }) => {
    const guestbookIcon = page.locator('[data-window-id="window-guestbook"]');
    await guestbookIcon.dblclick();
    await expect(page.locator('#window-guestbook')).toHaveAttribute('data-state', 'open');
    const titleBar = page.locator('#window-guestbook .title-bar');
    const startBox = await titleBar.boundingBox();
    expect(startBox).not.toBeNull();
    // Drag 80px right and 60px down
    await page.mouse.move(startBox.x + 30, startBox.y + 10);
    await page.mouse.down();
    await page.mouse.move(startBox.x + 110, startBox.y + 70, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(100);
    const endBox = await titleBar.boundingBox();
    // Window moved at least 40px on each axis (allowing for body zoom factor)
    expect(endBox.x - startBox.x).toBeGreaterThan(20);
    expect(endBox.y - startBox.y).toBeGreaterThan(20);
  });

  test('clicking a back window brings it to the front', async ({ page }) => {
    // Open two windows. Use the hash-deep-link route so we don't have to
    // dblclick icons that the first window's body may obscure.
    await page.evaluate(() => { window.location.hash = '#window-guestbook'; });
    await page.waitForTimeout(200);
    await page.evaluate(() => { window.location.hash = '#window-about'; });
    await page.waitForTimeout(200);
    await expect(page.locator('#window-guestbook')).toHaveAttribute('data-state', 'open');
    await expect(page.locator('#window-about')).toHaveAttribute('data-state', 'open');
    const guestbookZ = await page.evaluate(() => parseInt(window.getComputedStyle(document.getElementById('window-guestbook')).zIndex, 10));
    const aboutZ = await page.evaluate(() => parseInt(window.getComputedStyle(document.getElementById('window-about')).zIndex, 10));
    expect(aboutZ).toBeGreaterThan(guestbookZ);
    // Force-click the back window's title bar (about may overlap it).
    await page.locator('#window-guestbook .title-bar').click({ force: true });
    await page.waitForTimeout(100);
    const guestbookZ2 = await page.evaluate(() => parseInt(window.getComputedStyle(document.getElementById('window-guestbook')).zIndex, 10));
    const aboutZ2 = await page.evaluate(() => parseInt(window.getComputedStyle(document.getElementById('window-about')).zIndex, 10));
    expect(guestbookZ2).toBeGreaterThan(aboutZ2);
  });

  // --- Resize coverage (issue #18) ---
  //
  // The 8-edge resize logic at desktop.js:438-568 was unexercised before
  // these tests. The resize zone is the 8 outer pixels of a .window, but
  // a click only triggers resize when e.target is the .window itself
  // (not its .title-bar / .window-body / .status-bar children). At desktop
  // body zoom 1.5 the visible padding+margin frame is ~16px, comfortably
  // wider than the 8px RESIZE_ZONE. Resize click points target 4px in from
  // each edge to stay in the safe region.
  //
  // All resize tests open the Guestbook window (no data-no-resize, has a
  // visible title bar, content fits the min size of 300x200).

  // Distance in from the edge that lands cleanly in the .window padding
  // frame at desktop zoom 1.5 (avoids the .window-body margin and stays
  // inside the 8px RESIZE_ZONE).
  const EDGE_INSET = 4;

  // 98.css MIN_WIN_SIZE in desktop.js — kept in sync with the constant
  // there (line 10). If MIN_WIN_SIZE ever changes, this constant fails
  // the next time someone runs the clamp test.
  const MIN_WIN_W = 300;
  const MIN_WIN_H = 200;

  async function openGuestbook(page) {
    const icon = page.locator('[data-window-id="window-guestbook"]');
    await icon.dblclick();
    await page.waitForTimeout(300);
    await expect(page.locator('#window-guestbook')).toHaveAttribute('data-state', 'open');
    return page.locator('#window-guestbook');
  }

  test('SE-corner drag outward grows the window in the drag direction', async ({ page }) => {
    // AE5: at desktop body zoom 1.5, dragging the SE corner outward must
    // GROW both axes. The resize start-snapshot reads size via
    // getBoundingClientRect()/zoom (CSS px), matching the CSS-px style
    // writes; the earlier offsetWidth/zoom read double-divided by zoom
    // (offsetWidth is already unzoomed) and made outward SE drags shrink
    // the window. We assert direction (grow), not just that dimensions
    // changed. offsetWidth/offsetHeight are the unzoomed CSS px desktop.js
    // writes via `style.width = newW + 'px'`.
    const win = await openGuestbook(page);

    // Pin a known size + position away from the viewport edges so growth
    // is bounded only by the drag, never clamped by the viewport.
    await page.evaluate(() => {
      const el = document.getElementById('window-guestbook');
      el.style.left = '100px';
      el.style.top = '100px';
      el.style.width = '400px';
      el.style.height = '300px';
    });
    await page.waitForTimeout(100);

    const before = await page.evaluate(() => {
      const el = document.getElementById('window-guestbook');
      return { w: el.offsetWidth, h: el.offsetHeight };
    });

    const startBox = await win.boundingBox();
    expect(startBox).not.toBeNull();

    // SE corner: 4px inset so the click target is the .window itself,
    // not the .window-body inside the padding+margin frame.
    const startX = startBox.x + startBox.width - EDGE_INSET;
    const startY = startBox.y + startBox.height - EDGE_INSET;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 120, startY + 80, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(150);

    const after = await page.evaluate(() => {
      const el = document.getElementById('window-guestbook');
      return { w: el.offsetWidth, h: el.offsetHeight };
    });

    // Direction: outward SE drag grows both axes.
    expect(after.w).toBeGreaterThan(before.w);
    expect(after.h).toBeGreaterThan(before.h);
  });

  test('resizing below MIN_WIN_SIZE clamps to the minimum', async ({ page }) => {
    const win = await openGuestbook(page);

    // Start from a known-large size so the clamp path is unambiguous.
    await page.evaluate(() => {
      const el = document.getElementById('window-guestbook');
      el.style.width = '500px';
      el.style.height = '400px';
    });
    await page.waitForTimeout(100);

    const startBox = await win.boundingBox();
    // SE corner: drag inward by more than (500 - MIN_WIN_W) and
    // (400 - MIN_WIN_H) so both dimensions clamp.
    const startX = startBox.x + startBox.width - EDGE_INSET;
    const startY = startBox.y + startBox.height - EDGE_INSET;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    // Move 400px up-left in viewport coords. At body zoom 1.5 that's
    // ~267 unzoomed CSS px of shrink — comfortably past the 300/200
    // floor (the window started at 500x400 unzoomed).
    await page.mouse.move(startX - 400, startY - 400, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(100);

    // Read offsetWidth/offsetHeight (unzoomed CSS pixels) so we can
    // assert against MIN_WIN_SIZE directly without zoom math.
    const dims = await page.evaluate(() => {
      const el = document.getElementById('window-guestbook');
      return { w: el.offsetWidth, h: el.offsetHeight };
    });
    expect(dims.w).toBe(MIN_WIN_W);
    expect(dims.h).toBe(MIN_WIN_H);
  });

  test('NW-corner drag inward shrinks the window and holds MIN_WIN_SIZE', async ({ page }) => {
    const win = await openGuestbook(page);

    // Start large and away from the top-left so the NW corner is hittable
    // and there is room to shrink without hitting the MIN floor immediately.
    await page.evaluate(() => {
      const el = document.getElementById('window-guestbook');
      el.style.left = '200px';
      el.style.top = '200px';
      el.style.width = '500px';
      el.style.height = '400px';
    });
    await page.waitForTimeout(100);

    const before = await page.evaluate(() => {
      const el = document.getElementById('window-guestbook');
      return { w: el.offsetWidth, h: el.offsetHeight };
    });

    const box = await win.boundingBox();
    // NW corner needs a 2px inset (not EDGE_INSET=4): the top/left resize
    // strip is only the .window's 3px padding — the .title-bar (which the
    // resize handler excludes) begins ~4px in. The SE corner gets a wider
    // frame from .window-body's 8px margin, so 4px is safe there.
    const NW_INSET = 2;
    const startX = box.x + NW_INSET;
    const startY = box.y + NW_INSET;

    // Drag the NW corner toward the center (down-right): shrinks both axes.
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 90, startY + 90, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(150);

    const after = await page.evaluate(() => {
      const el = document.getElementById('window-guestbook');
      return { w: el.offsetWidth, h: el.offsetHeight };
    });

    // Direction: inward NW drag shrinks both axes, but never below the floor.
    expect(after.w).toBeLessThan(before.w);
    expect(after.h).toBeLessThan(before.h);
    expect(after.w).toBeGreaterThanOrEqual(MIN_WIN_W);
    expect(after.h).toBeGreaterThanOrEqual(MIN_WIN_H);
  });

  test('E-edge drag changes width only, not height', async ({ page }) => {
    const win = await openGuestbook(page);

    await page.evaluate(() => {
      const el = document.getElementById('window-guestbook');
      el.style.left = '100px';
      el.style.top = '100px';
      el.style.width = '400px';
      el.style.height = '300px';
    });
    await page.waitForTimeout(100);

    const before = await page.evaluate(() => {
      const el = document.getElementById('window-guestbook');
      return { w: el.offsetWidth, h: el.offsetHeight };
    });

    const box = await win.boundingBox();
    // Right edge, vertical middle → edge === 'e' (no N/S component).
    const startX = box.x + box.width - EDGE_INSET;
    const startY = box.y + box.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 120, startY, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(150);

    const after = await page.evaluate(() => {
      const el = document.getElementById('window-guestbook');
      return { w: el.offsetWidth, h: el.offsetHeight };
    });

    // Width grows in the drag direction; height is untouched by an E-only drag.
    expect(after.w).toBeGreaterThan(before.w);
    expect(after.h).toBe(before.h);
  });

  test('resizing an unfocused window brings it to the front', async ({ page }) => {
    // Open two windows. The second one becomes focused; we then resize
    // the first and assert focus transfers to it.
    await openGuestbook(page);
    await page.evaluate(() => { window.location.hash = '#window-about'; });
    await page.waitForTimeout(250);
    await expect(page.locator('#window-about')).toHaveAttribute('data-state', 'open');

    const aboutZ = await page.evaluate(() =>
      parseInt(window.getComputedStyle(document.getElementById('window-about')).zIndex, 10)
    );
    const guestbookZ = await page.evaluate(() =>
      parseInt(window.getComputedStyle(document.getElementById('window-guestbook')).zIndex, 10)
    );
    // Sanity: about opened last, so it sits on top.
    expect(aboutZ).toBeGreaterThan(guestbookZ);

    // Move the about window far off so guestbook's SE corner is hittable
    // without about's body covering it. Direct style writes are how the
    // U1 multi-window tests reposition windows for similar reasons.
    // Then pin guestbook to a known small rect.
    await page.evaluate(() => {
      const about = document.getElementById('window-about');
      about.style.left = '700px';
      about.style.top = '400px';
      const gb = document.getElementById('window-guestbook');
      gb.style.left = '20px';
      gb.style.top = '20px';
      gb.style.width = '300px';
      gb.style.height = '220px';
    });
    await page.waitForTimeout(100);

    const win = page.locator('#window-guestbook');
    const box = await win.boundingBox();
    const startX = box.x + box.width - EDGE_INSET;
    const startY = box.y + box.height - EDGE_INSET;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 40, startY + 40, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(100);

    // After resize, guestbook should be brought to front by onResizeStart's
    // bringToFront() call (desktop.js:488).
    const aboutZ2 = await page.evaluate(() =>
      parseInt(window.getComputedStyle(document.getElementById('window-about')).zIndex, 10)
    );
    const guestbookZ2 = await page.evaluate(() =>
      parseInt(window.getComputedStyle(document.getElementById('window-guestbook')).zIndex, 10)
    );
    expect(guestbookZ2).toBeGreaterThan(aboutZ2);
  });
});

test.describe('U1 — HIGH-severity bug fixes', () => {
  test.beforeEach(BOOTED);

  test('Notepad windows do not accumulate after open/close cycles', async ({ page }) => {
    // Open and close Notepad five times via the Start menu launcher.
    for (let i = 0; i < 5; i++) {
      await page.click('#start-button');
      await page.waitForTimeout(150);
      await page.hover('[role="menuitem"]:has-text("Programs")');
      await page.waitForSelector('.has-submenu.submenu-open .start-submenu', { state: 'visible' });
      await page.hover('[role="menuitem"]:has-text("Accessories")');
      await page.waitForTimeout(250);
      await page.click('[data-app="notepad"]');
      await page.waitForTimeout(200);
      const closeBtn = page.locator('[id^="window-notepad"][data-state="open"] [aria-label="Close"]').last();
      await closeBtn.click();
      await page.waitForTimeout(150);
    }
    // After 5 cycles, at most one notepad window should remain in the DOM
    // (the most recently-opened one if still open, or zero after close).
    const notepadCount = await page.locator('[id^="window-notepad"]').count();
    expect(notepadCount).toBeLessThanOrEqual(1);
  });

  test('Contact form Send button resets after closing mid-flight', async ({ page }) => {
    // Stall the Formspree request indefinitely.
    await page.route('https://formspree.io/**', async () => {
      // Never call route.fulfill — leaves the fetch pending forever.
    });

    // Open contact form via desktop icon
    const contactIcon = page.locator('[data-window-id="window-contact"]');
    await contactIcon.dblclick();
    await page.waitForTimeout(300);
    // Fill required fields
    await page.fill('#contact-from', 'test@example.com');
    await page.fill('#contact-message', 'Hello world');
    // Click Send — fetch is stalled by the route handler, button enters "Sending..." state
    await page.click('#contact-form button[type="submit"]');
    await expect(page.locator('#contact-form button[type="submit"]')).toHaveText(/Sending/i);
    // Close the contact window mid-flight
    await page.click('#window-contact .title-bar [aria-label="Close"]');
    await page.waitForTimeout(200);
    // Reopen — Send button should be back to its initial state
    await contactIcon.dblclick();
    await page.waitForTimeout(300);
    const sendBtn = page.locator('#contact-form button[type="submit"]');
    await expect(sendBtn).toHaveText(/^Send$/);
    await expect(sendBtn).toBeEnabled();
  });

  test('Title-bar right-click Minimize/Maximize/Close fire their actions', async ({ page }) => {
    // Open a window with a title bar
    const guestbookIcon = page.locator('[data-window-id="window-guestbook"]');
    await guestbookIcon.dblclick();
    await page.waitForTimeout(300);
    await expect(page.locator('#window-guestbook')).toHaveAttribute('data-state', 'open');

    // Right-click on its title bar
    await page.click('#window-guestbook .title-bar', { button: 'right' });
    await expect(page.locator('#context-menu-titlebar')).toHaveClass(/open/);

    // Click Minimize from the context menu
    await page.click('#context-menu-titlebar [data-action="ctx-minimize"]');
    await page.waitForTimeout(150);
    await expect(page.locator('#window-guestbook')).toHaveAttribute('data-state', 'minimized');
  });

  test('Tray-anchored windows do not retain conflicting left+right styles after close', async ({ page }) => {
    // Open clock via tray click (anchors via right/bottom/position:fixed)
    await page.click('#clock');
    await page.waitForTimeout(200);
    await expect(page.locator('#window-clock')).toHaveAttribute('data-state', 'open');
    // Close via tray click
    await page.click('#clock');
    await page.waitForTimeout(200);
    // After close, left/right/bottom/position should all be cleared
    const leftover = await page.evaluate(() => {
      const el = document.getElementById('window-clock');
      return {
        left: el.style.left,
        right: el.style.right,
        bottom: el.style.bottom,
        position: el.style.position,
      };
    });
    expect(leftover.right).toBe('');
    expect(leftover.bottom).toBe('');
    expect(leftover.position).toBe('');
    expect(leftover.left).toBe('');
  });

  test('Run dialog OK button works after Cancel+reopen', async ({ page }) => {
    // First open: Start > Run, click Cancel
    await page.click('#start-button');
    await page.click('[data-app="run"]');
    await page.waitForTimeout(300);
    await expect(page.locator('#window-run-dialog')).toHaveAttribute('data-state', 'open');
    // Click Cancel (data-close-window button inside the dialog)
    await page.click('#window-run-dialog [data-close-window="window-run-dialog"]');
    await page.waitForTimeout(150);
    await expect(page.locator('#window-run-dialog')).toHaveAttribute('data-state', 'closed');

    // Reopen: Start > Run
    await page.click('#start-button');
    await page.click('[data-app="run"]');
    await page.waitForTimeout(300);
    await expect(page.locator('#window-run-dialog')).toHaveAttribute('data-state', 'open');
    // Click OK — should close the Run dialog and launch the Matrix terminal
    await page.click('#window-run-dialog .run-ok-btn');
    await page.waitForTimeout(500);
    await expect(page.locator('#window-run-dialog')).toHaveAttribute('data-state', 'closed');
    await expect(page.locator('#window-matrix')).toBeVisible();
  });
});

test.describe('Relaunch and lifecycle regressions (review follow-ups)', () => {
  test.beforeEach(BOOTED);

  // Pins the core fix of the init-once contracts: N relaunches must not
  // stack N keydown handlers (one keystroke used to fire N button clicks).
  test('Calculator keystrokes fire once after repeated relaunches', async ({ page }) => {
    const openCalculator = async () => {
      await page.click('#start-button');
      await page.waitForTimeout(150);
      await page.hover('[role="menuitem"]:has-text("Programs")');
      await page.waitForSelector('.has-submenu.submenu-open .start-submenu', { state: 'visible' });
      await page.hover('[role="menuitem"]:has-text("Accessories")');
      await page.waitForTimeout(250);
      await page.click('[data-app="calculator"]');
      await page.waitForTimeout(300);
      await expect(page.locator('#window-calculator')).toHaveAttribute('data-state', 'open');
    };

    for (let i = 0; i < 3; i++) {
      await openCalculator();
      await page.click('#window-calculator .title-bar [aria-label="Close"]');
      await page.waitForTimeout(150);
    }

    await openCalculator();
    await page.keyboard.press('5');
    // Stacked handlers would produce '555…' — exactly one '5' proves single wiring.
    await expect(page.locator('#display')).toHaveText('5');
  });

  // Same init-once contract for Napster (napsterWired guard + launchNapster's
  // existing-window early-exit). A track-row dblclick calls window.open once;
  // rebound handlers across relaunches would open one tab per binding.
  test('Napster track dblclick opens exactly one link after repeated relaunches', async ({ page }) => {
    const openNapster = async () => {
      await page.click('#start-button');
      await expect(page.locator('#start-menu')).toHaveClass(/open/);
      await page.hover('[role="menuitem"]:has-text("Programs")');
      await page.waitForSelector('.has-submenu.submenu-open .start-submenu', { state: 'visible' });
      await expect(page.locator('[data-app="napster"]')).toBeVisible();
      await page.click('[data-app="napster"]');
      // The window is built inside runInit after napster.js loads — wait for a row.
      await expect(page.locator('#window-napster')).toHaveAttribute('data-state', 'open');
      await page.waitForSelector('#napster-results-body .napster-row');
    };

    for (let i = 0; i < 3; i++) {
      await openNapster();
      await page.click('#window-napster .title-bar [aria-label="Close"]');
      await page.waitForTimeout(150);
    }
    await openNapster();

    // Count window.open calls. A single dblclick handler fires it once; N
    // stacked handlers (one per relaunch) would fire it N times.
    await page.evaluate(() => {
      window.__napOpenCount = 0;
      window.open = function () { window.__napOpenCount++; return null; };
    });

    await page.locator('#napster-results-body .napster-row').first().dblclick();
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.__napOpenCount)).toBe(1);
  });

  // Minesweeper's `wired` guard: __initMinesweeper runs on EVERY launch
  // (launchMinesweeper has no early-exit), so only the guard keeps the grid's
  // delegated contextmenu handler bound once. With an EVEN relaunch count, a
  // stacked handler toggles the flag an even number of times on a single
  // right-click — leaving the cell UNflagged (mine-count 010). One binding
  // flags exactly once (🚩, mine-count 009).
  test('Minesweeper right-click flags exactly one cell after repeated relaunches', async ({ page }) => {
    const openMinesweeper = async () => {
      await page.click('#start-button');
      await expect(page.locator('#start-menu')).toHaveClass(/open/);
      await page.hover('[role="menuitem"]:has-text("Programs")');
      await page.waitForSelector('.has-submenu.submenu-open .start-submenu', { state: 'visible' });
      await page.hover('[role="menuitem"]:has-text("Games")');
      await expect(page.locator('[data-app="minesweeper"]')).toBeVisible();
      await page.click('[data-app="minesweeper"]');
      await expect(page.locator('#window-minesweeper')).toHaveAttribute('data-state', 'open');
      await page.waitForSelector('#window-minesweeper #grid .cell');
    };

    // 3 close/reopen cycles + a final open = 4 inits (even).
    for (let i = 0; i < 3; i++) {
      await openMinesweeper();
      await page.click('#window-minesweeper .title-bar [aria-label="Close"]');
      await page.waitForTimeout(150);
    }
    await openMinesweeper();

    const cell = page.locator('#window-minesweeper #grid .cell').first();
    await cell.click({ button: 'right' });
    await page.waitForTimeout(100);

    await expect(cell).toHaveText('🚩');
    await expect(page.locator('#window-minesweeper #mine-count')).toHaveText('009');
  });

  test('Restore from minimize reapplies maximized state', async ({ page }) => {
    const icon = page.locator('[data-window-id="window-guestbook"]');
    await icon.dblclick();
    await page.waitForTimeout(300);
    await expect(page.locator('#window-guestbook')).toHaveAttribute('data-state', 'open');

    await page.click('#window-guestbook .title-bar [aria-label="Maximize"]');
    await expect(page.locator('#window-guestbook')).toHaveAttribute('data-state', 'maximized');

    await page.click('#window-guestbook .title-bar [aria-label="Minimize"]');
    await expect(page.locator('#window-guestbook')).toHaveAttribute('data-state', 'minimized');

    // Taskbar-chip restore must land back on 'maximized', not 'open' at prevRect.
    await page.click('#taskbar-buttons [data-window-id="window-guestbook"]');
    await expect(page.locator('#window-guestbook')).toHaveAttribute('data-state', 'maximized');
  });

  // Exercises the success-path stale-submit token: closing and reopening the
  // contact form during the 1500ms post-success delay must leave the fresh
  // instance alone (no auto-close, no form.reset of the new draft).
  test('Contact form reopened during the post-success delay is not wiped', async ({ page }) => {
    await page.route('https://formspree.io/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    );

    const contactIcon = page.locator('[data-window-id="window-contact"]');
    await contactIcon.dblclick();
    await page.waitForTimeout(300);
    await page.fill('#contact-from', 'test@example.com');
    await page.fill('#contact-message', 'Hello world');
    await page.click('#contact-form button[type="submit"]');
    await expect(page.locator('#contact-form button[type="submit"]')).toHaveText(/Message Sent/i);

    // Close and reopen inside the 1500ms window — bumps contactSubmitToken.
    await page.click('#window-contact .title-bar [aria-label="Close"]');
    await page.waitForTimeout(150);
    await contactIcon.dblclick();
    await page.waitForTimeout(300);
    await expect(page.locator('#window-contact')).toHaveAttribute('data-state', 'open');

    await page.fill('#contact-message', 'Fresh draft');
    // Let the armed stale timer fire (1500ms after the original submit).
    await page.waitForTimeout(1600);

    await expect(page.locator('#window-contact')).toHaveAttribute('data-state', 'open');
    await expect(page.locator('#contact-message')).toHaveValue('Fresh draft');
  });
});

test.describe('U3 — Focus-state: inactive title bars everywhere', () => {
  test.beforeEach(BOOTED);

  // AE2: only the focused window wears the active (navy) title bar; every
  // other open window's title bar carries .inactive (gray). 98.css ships both
  // gradients — this locks the class-toggle so focus is truthful, and that a
  // plain title-bar click swaps the states between two open windows.
  test('focusing swaps active/inactive title bars between two open windows', async ({ page }) => {
    await page.evaluate(() => { window.location.hash = '#window-guestbook'; });
    await page.waitForTimeout(200);
    await page.evaluate(() => { window.location.hash = '#window-about'; });
    await page.waitForTimeout(200);
    await expect(page.locator('#window-guestbook')).toHaveAttribute('data-state', 'open');
    await expect(page.locator('#window-about')).toHaveAttribute('data-state', 'open');

    // About opened last → it is focused: navy (no .inactive). Guestbook is gray.
    await expect(page.locator('#window-about .title-bar')).not.toHaveClass(/inactive/);
    await expect(page.locator('#window-guestbook .title-bar')).toHaveClass(/inactive/);

    // Click the back window's title bar (about may overlap it) → states swap.
    await page.locator('#window-guestbook .title-bar').click({ force: true });
    await page.waitForTimeout(100);
    await expect(page.locator('#window-guestbook .title-bar')).not.toHaveClass(/inactive/);
    await expect(page.locator('#window-about .title-bar')).toHaveClass(/inactive/);
  });

  // Close-then-focus-next: closing the focused window hands focus to the
  // next window down the stack, and that window's title bar must turn active.
  test('closing the focused window activates the newly-focused window title bar', async ({ page }) => {
    await page.evaluate(() => { window.location.hash = '#window-guestbook'; });
    await page.waitForTimeout(200);
    await page.evaluate(() => { window.location.hash = '#window-about'; });
    await page.waitForTimeout(200);
    // About is focused; guestbook is inactive underneath.
    await expect(page.locator('#window-guestbook .title-bar')).toHaveClass(/inactive/);

    await page.click('#window-about .title-bar [aria-label="Close"]');
    await page.waitForTimeout(150);
    await expect(page.locator('#window-about')).toHaveAttribute('data-state', 'closed');

    // Guestbook is now the only/topmost window → its title bar becomes active.
    await expect(page.locator('#window-guestbook')).toHaveAttribute('data-state', 'open');
    await expect(page.locator('#window-guestbook .title-bar')).not.toHaveClass(/inactive/);
  });

  // Initial-open path: the first (single) window a user opens is focused, so
  // its title bar must render active — never stranded in the gray state.
  test('a single open window has an active title bar', async ({ page }) => {
    await page.evaluate(() => { window.location.hash = '#window-guestbook'; });
    await page.waitForTimeout(200);
    await expect(page.locator('#window-guestbook')).toHaveAttribute('data-state', 'open');
    await expect(page.locator('#window-guestbook .title-bar')).not.toHaveClass(/inactive/);
  });
});

test.describe('U6 — Minimize/restore taskbar zoom-rectangle animation', () => {
  test.beforeEach(BOOTED);

  async function openGuestbook(page) {
    const icon = page.locator('[data-window-id="window-guestbook"]');
    await icon.dblclick();
    await page.waitForTimeout(200);
    await expect(page.locator('#window-guestbook')).toHaveAttribute('data-state', 'open');
  }

  const MIN_BTN = '#window-guestbook .title-bar [aria-label="Minimize"]';
  const CHIP = '#taskbar-buttons [data-window-id="window-guestbook"]';

  // AE3: a minimize always reaches the terminal state (minimized + display:none)
  // well within 500ms — the zoom-rectangle animation must never leave the
  // window stranded on-screen.
  test('minimize reaches minimized + display:none within 500ms', async ({ page }) => {
    await openGuestbook(page);
    await page.click(MIN_BTN);
    await expect(page.locator('#window-guestbook')).toHaveAttribute('data-state', 'minimized', { timeout: 500 });
    const display = await page.evaluate(() =>
      getComputedStyle(document.getElementById('window-guestbook')).display
    );
    expect(display).toBe('none');
  });

  // R3: without reduced motion, minimize animates — a transform (translate +
  // scale toward the taskbar) is applied to the window element mid-flight,
  // before it is hidden. This is the new behavior; it is red pre-change.
  test('minimize applies a transform toward the taskbar when motion is allowed', async ({ page }) => {
    await openGuestbook(page);
    await page.click(MIN_BTN);
    const sawTransform = await page
      .waitForFunction(() => {
        const el = document.getElementById('window-guestbook');
        return !!el.style.transform && el.style.transform.indexOf('scale') !== -1;
      }, null, { timeout: 1000, polling: 10 })
      .then(() => true)
      .catch(() => false);
    expect(sawTransform).toBe(true);
  });

  // AE3: prefers-reduced-motion disables the animation — the window disappears
  // instantly with no inline transform ever applied.
  test('reduced motion minimizes instantly with no transform', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openGuestbook(page);
    await page.click(MIN_BTN);
    await expect(page.locator('#window-guestbook')).toHaveAttribute('data-state', 'minimized');
    const snap = await page.evaluate(() => {
      const el = document.getElementById('window-guestbook');
      return { transform: el.style.transform, display: getComputedStyle(el).display };
    });
    expect(snap.transform).toBe('');
    expect(snap.display).toBe('none');
  });

  // Guards the double-fire path: minimize → restore → minimize in rapid
  // succession (each click landing mid-animation) must not strand the window
  // in a transformed state once the dust settles.
  test('rapid minimize/restore/minimize leaves no residual transform', async ({ page }) => {
    await openGuestbook(page);
    // 50ms gaps land each interaction inside the previous ~180ms animation,
    // forcing the in-flight animation to complete before the next begins.
    await page.click(MIN_BTN);            // minimize (anim out)
    await page.waitForTimeout(50);
    await page.click(CHIP);               // active+open → re-minimize completes it
    await page.waitForTimeout(50);
    await page.click(CHIP);               // minimized → restore (anim in)
    await page.waitForTimeout(50);
    await page.click(CHIP);               // active+open → minimize (anim out)
    await page.waitForTimeout(500);       // let the final animation settle
    const res = await page.evaluate(() => {
      const el = document.getElementById('window-guestbook');
      return { transform: el.style.transform, state: el.getAttribute('data-state') };
    });
    expect(res.transform).toBe('');
    expect(res.state).toBe('minimized');
  });

  // Closing a window while its minimize animation is still in flight must not
  // let the pending finalize (fallback timer) resurrect it into a phantom
  // 'minimized' state after it is already closed. closeWindow snaps the
  // animation to its end first; without that guard the window ends 'minimized'
  // ~250ms after close, with no taskbar chip. Escape closes the active window.
  test('closing mid-minimize-animation does not resurrect a phantom minimized window', async ({ page }) => {
    await openGuestbook(page);
    await page.click(MIN_BTN);        // minimize animation + finalize timer pending
    await page.waitForTimeout(40);    // land inside the animation window
    await page.keyboard.press('Escape'); // closeWindow(activeWindowId) mid-flight
    await page.waitForTimeout(400);   // past WINDOW_ANIM_FALLBACK_MS (250ms)
    const res = await page.evaluate(() => {
      const el = document.getElementById('window-guestbook');
      return {
        state: el.getAttribute('data-state'),
        chip: !!document.querySelector('#taskbar-buttons [data-window-id="window-guestbook"]'),
      };
    });
    expect(res.state).toBe('closed'); // not flipped back to 'minimized'
    expect(res.chip).toBe(false);     // no phantom taskbar chip
  });
});

test.describe('Maximize restore-size survives a desktop resize round-trip', () => {
  test.beforeEach(BOOTED);

  // A same-orientation desktop resize (no zoom-band crossing, no rotation) must
  // NOT shrink a maximized window's stored restore size. onViewportChange only
  // re-fits prevRect on a rotation or zoom crossing; the Math.min clamp is
  // monotonic, so running it on every resize would shrink restore-size and it
  // would never grow back when the window is widened again.
  test('narrowing then re-widening the browser preserves the restore width', async ({ page }) => {
    await page.evaluate(() => { window.location.hash = '#window-guestbook'; });
    await expect(page.locator('#window-guestbook')).toHaveAttribute('data-state', 'open');
    // Float it wider than the narrow-point CSS viewport (900 / zoom 1.5 = 600),
    // so a monotonic clamp would visibly shrink it.
    await page.evaluate(() => {
      const el = document.getElementById('window-guestbook');
      el.style.left = '60px'; el.style.top = '40px';
      el.style.width = '700px'; el.style.height = '360px';
    });
    const MAX_BTN = '#window-guestbook .title-bar [aria-label="Maximize"]';
    await page.click(MAX_BTN); // snapshots prevRect ~ 700 wide
    await expect(page.locator('#window-guestbook')).toHaveAttribute('data-state', 'maximized');

    const vp = page.viewportSize();
    await page.setViewportSize({ width: 900, height: vp.height }); // narrower, still landscape, still >768
    await page.waitForTimeout(60);
    await page.setViewportSize({ width: vp.width, height: vp.height }); // back to original
    await page.waitForTimeout(60);

    await page.click(MAX_BTN); // restore
    await expect(page.locator('#window-guestbook')).toHaveAttribute('data-state', 'open');
    const width = await page.evaluate(() =>
      parseInt(document.getElementById('window-guestbook').style.width, 10)
    );
    expect(width).toBe(700); // preserved, not shrunk to the narrow-point viewport
  });
});
