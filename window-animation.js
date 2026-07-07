;(function() {
  'use strict';

  // Minimize/restore zoom-rectangle animation, extracted from desktop.js so the
  // window-manager file stays focused on state. Exposed on window.Win98WindowAnim.
  // Self-contained: the one external dependency (the body zoom factor) is passed
  // in, so this module never reaches back into desktop.js.

  // Duration matches the Start-menu submenu slide (style.css transform 0.18s
  // ease-out). The transitionend fallback fires a touch later so a dropped event
  // can't wedge the window in a half-transformed state.
  var WINDOW_ANIM_MS = 180;
  var WINDOW_ANIM_FALLBACK_MS = 250;

  // Honor the OS "reduce motion" setting. Wrapped because matchMedia can
  // be absent/throwing in exotic embeddings; a missing signal means animate.
  function prefersReducedMotion() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e) { return false; }
  }

  // Translate (in unzoomed CSS px) that moves the window's center onto the
  // taskbar button's center. getBoundingClientRect returns zoom-scaled device
  // px for both elements, so their delta is device px; dividing by the body
  // zoom (passed in) converts it to the element-local units a CSS transform
  // expects (the transform is re-scaled by the same zoom when painted, landing
  // on target).
  function taskbarVector(winEl, targetEl, zoom) {
    var z = zoom || 1;
    var wr = winEl.getBoundingClientRect();
    var br = targetEl.getBoundingClientRect();
    return {
      x: ((br.left + br.width / 2) - (wr.left + wr.width / 2)) / z,
      y: ((br.top + br.height / 2) - (wr.top + wr.height / 2)) / z
    };
  }

  // Run a one-shot transform+opacity transition on win.el from
  // (startTransform/startOpacity) to (endTransform/endOpacity), then clear the
  // inline transition/transform/opacity and call onDone. Completion is
  // idempotent via win.animFinish: a transitionend, the fallback timer, or a
  // double-fire from the next minimize/restore all snap it to the end exactly
  // once, so the window can never wedge in a half-transformed state.
  function animateWindowTransform(win, startTransform, startOpacity, endTransform, endOpacity, onDone) {
    var el = win.el;
    var finished = false;
    var fallback = null;
    function onEnd(e) {
      if (e.target === el && e.propertyName === 'transform') finish();
    }
    function finish() {
      if (finished) return;
      finished = true;
      if (fallback) { clearTimeout(fallback); fallback = null; }
      el.removeEventListener('transitionend', onEnd);
      win.animFinish = null;
      el.style.transition = '';
      el.style.transform = '';
      el.style.opacity = '';
      if (onDone) onDone();
    }
    win.animFinish = finish;

    // Commit the start state with no transition, force a reflow so it becomes
    // the transition origin, then flip to the end state under the transition.
    el.style.transition = 'none';
    el.style.transform = startTransform;
    el.style.opacity = startOpacity;
    void el.offsetWidth; // reflow: lock in the start state
    el.addEventListener('transitionend', onEnd);
    el.style.transition = 'transform ' + WINDOW_ANIM_MS + 'ms ease-out, opacity ' + WINDOW_ANIM_MS + 'ms ease-out';
    el.style.transform = endTransform;
    el.style.opacity = endOpacity;
    fallback = setTimeout(finish, WINDOW_ANIM_FALLBACK_MS);
  }

  window.Win98WindowAnim = {
    prefersReducedMotion: prefersReducedMotion,
    taskbarVector: taskbarVector,
    animate: animateWindowTransform,
    ANIM_MS: WINDOW_ANIM_MS,
    FALLBACK_MS: WINDOW_ANIM_FALLBACK_MS
  };
})();
