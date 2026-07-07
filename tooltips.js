;(function() {
  'use strict';

  // Win98 hover tooltips, extracted from desktop.js. This module owns the
  // generic mechanism — one reusable #win98-tooltip element, hover-gating,
  // positioning, show/hide timing, and document-delegated binding. The caller
  // injects what is app-specific: the body zoom factor and a sourceFor(el)
  // resolver that maps a hovered node to its { el, text } (kept in desktop.js
  // because the tray-clock text depends on the clock's date helpers).
  //
  // Bound only when the pointer can actually hover (desktop); phones report
  // (hover: none) so nothing binds and no tooltip can ever show. Native title
  // attributes are avoided because they can't be styled to match Win98.
  var TOOLTIP_DELAY = 500;

  // opts: { getZoom: () => number, sourceFor: (el) => ({ el, text } | null) }
  function setup(opts) {
    var tooltipEl = document.getElementById('win98-tooltip');
    if (!tooltipEl) return;
    if (!(window.matchMedia && window.matchMedia('(hover: hover)').matches)) return;

    var getZoom = (opts && opts.getZoom) || function() { return 1; };
    var sourceFor = opts && opts.sourceFor;
    if (!sourceFor) return;

    var showTimer = null;
    var currentTarget = null;

    function positionAndShow(targetEl, text) {
      var z = getZoom();
      tooltipEl.textContent = text;
      tooltipEl.classList.add('visible');
      // Measure after making visible; getBoundingClientRect returns viewport
      // (post-zoom) coordinates in the same space as clientX / innerWidth.
      var tRect = tooltipEl.getBoundingClientRect();
      var aRect = targetEl.getBoundingClientRect();
      var gap = 2;
      var x = aRect.left;
      var y = aRect.bottom + gap;
      // Flip above the target when it would overflow the bottom edge (the tray
      // clock and quick-launch live in the taskbar at the bottom).
      if (y + tRect.height > window.innerHeight) y = aRect.top - tRect.height - gap;
      if (x + tRect.width > window.innerWidth) x = window.innerWidth - tRect.width - gap;
      if (x < 0) x = gap;
      if (y < 0) y = gap;
      // CSS position lives in the pre-zoom coordinate space, so divide by zoom
      // (same convention as showContextMenu).
      tooltipEl.style.left = (x / z) + 'px';
      tooltipEl.style.top = (y / z) + 'px';
    }

    function scheduleTooltip(targetEl, text) {
      clearTimeout(showTimer);
      showTimer = setTimeout(function() { positionAndShow(targetEl, text); }, TOOLTIP_DELAY);
    }

    function cancelTooltip() {
      clearTimeout(showTimer);
      tooltipEl.classList.remove('visible');
      currentTarget = null;
    }

    // Delegated over the whole document so per-window title-bar controls are
    // covered without per-window wiring. pointerover/out bubble (unlike
    // pointerenter/leave), so closest() dedupes moves within a target.
    document.addEventListener('pointerover', function(e) {
      var src = sourceFor(e.target);
      if (!src || !src.text) return;
      if (currentTarget === src.el) return;
      currentTarget = src.el;
      scheduleTooltip(src.el, src.text);
    });

    document.addEventListener('pointerout', function(e) {
      if (!currentTarget) return;
      // Ignore moves that stay inside the current target (e.g. button -> img).
      if (e.relatedTarget && currentTarget.contains(e.relatedTarget)) return;
      cancelTooltip();
    });

    // Any press dismisses the tooltip so it never lingers over an activated
    // control (matches native Win98).
    document.addEventListener('pointerdown', cancelTooltip);
  }

  window.Win98Tooltips = { setup: setup };
})();
