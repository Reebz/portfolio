/*
 * Clippy — the Office Assistant, reimagined as a portfolio guide. An inline
 * SVG paperclip (no external sprite; CSP is default-src 'self') plus a 98.css
 * speech bubble whose tips actually open the relevant windows.
 *
 * window.__initClippy() is idempotent and honors a persisted dismissal. It
 * reads the desktop API from window.__win98 ({ open(id), launch(appName) }),
 * set by desktop.js init, so this file stays decoupled from the IIFE.
 */
(function () {
  'use strict';

  var DISMISS_KEY = 'clippy-dismissed';

  // Tips carry real navigation. `open` targets a window id; `launch` targets a
  // Start-menu app name. `null` action just advances.
  var TIPS = [
    { text: "Hi! It looks like you're browsing a portfolio. Want the tour?", label: 'Sure' },
    { text: 'Every icon on the desktop opens something real — double-click to explore.', label: 'Next' },
    { text: 'Curious who built this?', label: 'Meet Mitch', open: 'window-about' },
    { text: 'Want to get in touch? The E-Mail app really sends.', label: 'Open E-Mail', open: 'window-contact' },
    { text: 'Power user? There is a real MS-DOS Prompt hiding in here. Try TYPE RESUME.TXT.', label: 'Open MS-DOS', launch: 'dos' },
    { text: "That's the tour. Enjoy poking around!", label: 'Thanks' }
  ];

  function api() { return window.__win98 || {}; }

  function isDismissed() {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; }
    catch (e) { return false; }
  }
  function persistDismiss() {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch (e) { /* private mode */ }
  }

  function svgClippy() {
    // A simple, recognizable paperclip with eyes.
    return '' +
      '<svg viewBox="0 0 64 96" width="52" height="78" aria-hidden="true" focusable="false">' +
        '<g fill="none" stroke="#8a8a8a" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M20 30 v34 a12 12 0 0 0 24 0 V22 a8 8 0 0 0 -16 0 v40 a4 4 0 0 0 8 0 V30"/>' +
        '</g>' +
        '<g class="clippy-brows" stroke="#333" stroke-width="3" stroke-linecap="round">' +
          '<line x1="21" y1="20" x2="30" y2="24"/>' +
          '<line x1="43" y1="20" x2="34" y2="24"/>' +
        '</g>' +
        '<g class="clippy-eyes">' +
          '<circle cx="26" cy="32" r="6" fill="#fff" stroke="#333" stroke-width="2"/>' +
          '<circle cx="38" cy="32" r="6" fill="#fff" stroke="#333" stroke-width="2"/>' +
          '<circle cx="27" cy="33" r="2.4" fill="#111"/>' +
          '<circle cx="39" cy="33" r="2.4" fill="#111"/>' +
        '</g>' +
      '</svg>';
  }

  function initClippy() {
    if (isDismissed()) return;
    if (document.getElementById('clippy')) return; // already showing

    var host = document.createElement('div');
    host.id = 'clippy';
    host.setAttribute('role', 'complementary');
    host.setAttribute('aria-label', 'Office Assistant');
    host.innerHTML =
      '<div class="clippy-bubble" role="dialog" aria-live="polite">' +
        '<button class="clippy-close" aria-label="Dismiss assistant" title="Go away">&times;</button>' +
        '<p class="clippy-text"></p>' +
        '<div class="clippy-actions">' +
          '<button class="clippy-action"></button>' +
        '</div>' +
      '</div>' +
      '<div class="clippy-char" aria-hidden="true">' + svgClippy() + '</div>';

    document.body.appendChild(host);

    var textEl = host.querySelector('.clippy-text');
    var actionBtn = host.querySelector('.clippy-action');
    var bubble = host.querySelector('.clippy-bubble');
    var idx = 0;

    function render() {
      var tip = TIPS[idx];
      textEl.textContent = tip.text;
      actionBtn.textContent = tip.label || 'Next';
    }

    function dismiss() {
      persistDismiss();
      if (host.parentNode) host.parentNode.removeChild(host);
    }

    actionBtn.addEventListener('click', function () {
      var tip = TIPS[idx];
      if (tip.open && api().open) api().open(tip.open);
      else if (tip.launch && api().launch) api().launch(tip.launch);
      idx++;
      if (idx >= TIPS.length) { dismiss(); return; }
      render();
    });

    host.querySelector('.clippy-close').addEventListener('click', dismiss);

    // Wiggle to draw the eye when the bubble first appears.
    render();
    requestAnimationFrame(function () {
      host.classList.add('clippy-show');
      if (bubble) bubble.classList.add('clippy-bubble-in');
    });
  }

  window.__initClippy = initClippy;
})();
