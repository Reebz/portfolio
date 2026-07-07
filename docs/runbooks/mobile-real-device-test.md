# Mobile Real-Device Test Runbook

Manual smoke test the owner walks through on a real iPhone and a real iPad before merging any PR that touches mobile-affecting code. This is the backstop for the test categories that automation cannot fully cover: real iOS Safari behavior, real touch latency, and real visual feel.

Playwright's `webkit` engine and the mobile viewport projects cover most regressions, but they cannot reproduce iOS Safari's touch event timing, the rubber-band scroll, the on-screen keyboard's viewport effect, or the haptics of dragging a window with a finger. Walk this list before merge.

## When to follow this runbook

Follow it on any PR that touches:

- `style.css` mobile `@media` blocks (anything inside `@media (max-width: ...)` or `(pointer: coarse)` queries)
- `desktop.js` mobile-conditional paths — `isMobile()`, `clampWindowToViewport`, `onViewportChange`, `recoverWindowIfOffScreen`, `layoutIcons`
- `index.html` taskbar markup, Start menu markup, or icon-grid markup
- `boot.js` (boot sequence visibility differs between iPhone and iPad)

If a PR only touches desktop chrome (e.g. window chrome CSS gated behind a non-mobile selector), the automated suite is sufficient and this runbook can be skipped.

## The steps

Walk these in order on each device. If any step fails, see "What if a step fails" below.

### 1. Cold load (iPhone)

**Action.** Open Safari on iPhone. Visit https://reebz.com (force a cold load — clear Safari cache or use a private tab).

**Expected.** Win98 desktop renders within ~2 seconds. The page does not scroll vertically or horizontally. Icons are arranged in a grid. The taskbar is pinned at the bottom of the viewport.

**Automated coverage.** [`tests/mobile-cold-load.spec.js`](../../tests/mobile-cold-load.spec.js), [`tests/mobile-no-overflow.spec.js`](../../tests/mobile-no-overflow.spec.js).

### 2. Cold load (iPad)

**Action.** Open Safari on iPad. Visit https://reebz.com (cold load).

**Expected.** Full Win98 desktop with the BIOS boot sequence — Award POST screen, then the Win98 splash, then the desktop. Mouse-equivalent chrome (no mobile-specific layout). Quick-launch buttons visible on the taskbar to the right of the Start button.

**Automated coverage.** [`tests/tablet-inherits-desktop.spec.js`](../../tests/tablet-inherits-desktop.spec.js).

### 3. Icon launch

**Action.** On iPhone, tap the About icon on the desktop.

**Expected.** The About window opens and shows the About content. No double-fire, no ghost taps.

**Automated coverage.** [`tests/mobile-cold-load.spec.js`](../../tests/mobile-cold-load.spec.js).

### 4. Window close

**Action.** On iPhone, with the About window open, tap the X button on the title bar.

**Expected.** The window closes. Tap target is large enough to hit reliably with a thumb.

**Automated coverage.** [`tests/mobile-title-bar-controls.spec.js`](../../tests/mobile-title-bar-controls.spec.js). Manual is the backstop for B1-class bugs — real iOS tap behavior on the title-bar control row, which Playwright cannot fully simulate.

### 5. Window drag

**Action.** On iPhone, open Cavaro (tap its icon). Touch-drag the title bar across the screen.

**Expected.** The window moves smoothly with the finger. No jank, no jump, no lost pointer. The window stays under the finger until released.

**Automated coverage.** [`tests/mobile-multi-window.spec.js`](../../tests/mobile-multi-window.spec.js) covers this programmatically via `pointerdown` / `pointermove` events. Manual is the backstop for real touch latency and the visual feel of the drag.

### 6. Multi-window + occlusion recovery

**Action.** On iPhone, open both About and Cavaro. Drag the About window partially off-screen to the right (until only a sliver remains visible). Tap About's chip in the taskbar.

**Expected.** About returns fully into view. The recovery brings the window back so its title bar is reachable.

**Automated coverage.** [`tests/mobile-multi-window.spec.js`](../../tests/mobile-multi-window.spec.js), [`tests/mobile-taskbar-layout.spec.js`](../../tests/mobile-taskbar-layout.spec.js).

### 7. Start menu navigation

**Action.** On iPhone, tap the Start button. Tap Programs. The submenu slides in from the right. Tap Calculator at the leaf.

**Expected.** The menu closes cleanly and Calculator opens. The sliding animation does not leave the submenu stuck on screen.

**Automated coverage.** [`tests/mobile-start-menu.spec.js`](../../tests/mobile-start-menu.spec.js), [`tests/mobile-start-menu-depth.spec.js`](../../tests/mobile-start-menu-depth.spec.js).

### 8. Form input

**Action.** On iPhone, open Contact (or Guestbook). Tap an input field to focus it. Observe the viewport when the keyboard opens.

**Expected.** The viewport does NOT zoom in on the input. The 16px font-size guard prevents iOS Safari's auto-zoom-to-input behavior.

**Automated coverage.** [`tests/mobile-input-no-zoom.spec.js`](../../tests/mobile-input-no-zoom.spec.js).

### 9. Orientation change

**Action.** On iPhone, open two windows in portrait orientation. Rotate the device to landscape.

**Expected.** Both windows remain visible after rotation. Sizes adjust to the new viewport. Title bars remain on-screen and reachable.

**Automated coverage.** [`tests/mobile-orientation.spec.js`](../../tests/mobile-orientation.spec.js).

### 10. Maximize-by-default (portrait iPhone)

**Action.** On iPhone in portrait, tap the Napster icon (or About, Guestbook, Matrix — any resizable app window). 

**Expected.** The window opens already maximized: full width, full height above the taskbar, no floating cascade window clamped to a corner. Small dialogs (Calculator, Minesweeper, Run, ICQ, Clock) still open at their native size, centered.

**Automated coverage.** [`tests/mobile-maximize-default.spec.js`](../../tests/mobile-maximize-default.spec.js).

### 11. Restore to floating (portrait iPhone)

**Action.** With a maximized app window open (from step 10), tap the Maximize/restore control on the title bar.

**Expected.** The window restores to a floating window that sits fully on-screen — clamped inside the viewport, title bar reachable. Tapping the control again re-maximizes it.

**Automated coverage.** [`tests/mobile-maximize-default.spec.js`](../../tests/mobile-maximize-default.spec.js), [`tests/mobile-title-bar-controls.spec.js`](../../tests/mobile-title-bar-controls.spec.js).

### 12. Start-menu sidebar stripe (portrait iPhone)

**Action.** On iPhone, tap the Start button.

**Expected.** The Start menu slides in with the vertical "Windows 98" sidebar stripe visible down the left edge, and the menu fills the viewport height cleanly with no dead silver band above the taskbar.

**Automated coverage.** [`tests/mobile-start-menu.spec.js`](../../tests/mobile-start-menu.spec.js). Manual is the backstop for the visual feel of the stripe and the slide.

### 13. System sounds + speaker toggle (audible — real device only)

**Action.** On iPhone, after the first tap anywhere (browser autoplay unlocks audio), open the Shut Down or Run dialog and listen for the error ding. Then tap the speaker icon in the system tray; open a dialog again.

**Expected.** With sound on, dialog opens play a short Win98-style ding. Tapping the tray speaker mutes it (icon shows the red mute slash) and silences all sounds; the choice persists across a reload. This is the one check automation cannot make — Playwright asserts the toggle state and persistence, never the audible output.

**Automated coverage.** [`tests/sounds.spec.js`](../../tests/sounds.spec.js) (toggle state + persistence only; audible output is manual).

## What if a step fails

1. File a GitHub issue. Title it `mobile real-device: step N failed — <one-line summary>`. Link to this runbook in the body, paste the device + iOS version + Safari version, and attach a screenshot or screen recording.
2. Block the PR. Expected resolution before merge.
3. If the failure is discovered in production (post-merge), revert the PR and fix forward on a follow-up branch. Do not patch in place on `main`.

## iPad-specific notes

Per PR #10, iPads inherit the desktop styling. The `mobile-*` automated specs do NOT run on iPad — they are gated on touch detection combined with `max-width: 767px`, which iPads do not satisfy. Step 2 above is the iPad backstop.

What this means in practice:

- A change that breaks the desktop chrome on iPad will not be caught by the mobile suite. It may be caught by [`tests/tablet-inherits-desktop.spec.js`](../../tests/tablet-inherits-desktop.spec.js) and by the desktop suite, but neither runs against real iPadOS Safari.
- Walk step 2 on a real iPad whenever a PR touches anything iPad would render — which is most of the codebase, since iPad gets the full desktop view.
- Pay attention to the boot sequence on iPad. iPhones skip BIOS POST; iPads see it. If a PR touches `boot.js`, verify the full boot plays through on iPad.
