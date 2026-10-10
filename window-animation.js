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

  // Win98's own window animation (DrawAnimatedRects, IDANI_CAPTION), used on
  // desktop and tablets: the window appears or vanishes at once while a copy
  // of its caption bar flies between two rectangles — title bar to taskbar
  // button on minimize, the reverse on restore, old title bar to new on
  // maximize. The copy is redrawn at each size (text clipped, not squashed),
  // as Win98 did. Rects come from getBoundingClientRect (zoomed px); the
  // caption is fixed inside the zoomed body, so they are divided by the zoom.
  // Completion shares win.animFinish with animateWindowTransform: the next
  // minimize/restore/maximize/close snaps a flight to its end first.
  var CAPTION_MS = 200;

  function flyCaption(win, fromRect, toRect, zoom, onDone) {
    var z = zoom || 1;
    var bar = win.el.querySelector('.title-bar');
    var cap = document.createElement('div');
    cap.className = 'caption-flight';
    cap.setAttribute('aria-hidden', 'true');
    if (bar) {
      var barStyle = getComputedStyle(bar);
      cap.style.backgroundImage = barStyle.backgroundImage;
      cap.style.backgroundColor = barStyle.backgroundColor;
      var icon = bar.querySelector('.title-bar-icon');
      if (icon) {
        var img = document.createElement('img');
        img.src = icon.src;
        img.alt = '';
        cap.appendChild(img);
      }
      var text = bar.querySelector('.title-bar-text');
      var label = document.createElement('span');
      label.textContent = text ? text.textContent : '';
      if (text) label.style.color = getComputedStyle(text).color;
      cap.appendChild(label);
    }

    function box(r) {
      return { left: r.left / z + 'px', top: r.top / z + 'px', width: r.width / z + 'px', height: r.height / z + 'px' };
    }
    var from = box(fromRect);
    var to = box(toRect);
    // Rest at the end rect, so a browser without element.animate still
    // finishes in the right place.
    cap.style.left = to.left;
    cap.style.top = to.top;
    cap.style.width = to.width;
    cap.style.height = to.height;
    document.body.appendChild(cap);

    var finished = false;
    var anim = null;
    var fallback = null;
    function finish() {
      if (finished) return;
      finished = true;
      if (fallback) { clearTimeout(fallback); fallback = null; }
      if (anim) anim.cancel();
      cap.remove();
      if (win.animFinish === finish) win.animFinish = null;
      if (onDone) onDone();
    }
    win.animFinish = finish;

    if (typeof cap.animate === 'function') {
      anim = cap.animate([from, to], { duration: CAPTION_MS, easing: 'linear' });
      anim.onfinish = finish;
    }
    fallback = setTimeout(finish, CAPTION_MS + 80);
  }

  window.Win98WindowAnim = {
    prefersReducedMotion: prefersReducedMotion,
    taskbarVector: taskbarVector,
    animate: animateWindowTransform,
    flyCaption: flyCaption,
    ANIM_MS: WINDOW_ANIM_MS,
    FALLBACK_MS: WINDOW_ANIM_FALLBACK_MS,
    CAPTION_MS: CAPTION_MS
  };
})();
