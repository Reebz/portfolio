;(function() {
  'use strict';

  // WebAudio-synthesized system sounds. Zero audio asset files by design —
  // Microsoft's startup/ding WAVs are copyrighted, so every sound here is
  // built from oscillators (extending boot.js's dosBeep precedent).
  //
  // Contract: every play call is a strict no-op when sound is disabled or no
  // AudioContext is available, and never throws. The AudioContext is created
  // lazily inside a play call — which only runs when enabled — so a muted site
  // never constructs one at all (autoplay-safe + observable in tests).

  // Default ENABLED. desktop.js syncs this from the persisted 'sound-enabled'
  // flag on init and on every tray-toggle click, so play calls can gate
  // synchronously without touching storage.
  var enabled = true;

  var ctx = null;          // lazily created on first (enabled) play; never before
  var startupArmed = false;

  // Create/resume the shared AudioContext. Only ever reached from a play*
  // function that has already checked `enabled`. Wrapped: the constructor can
  // throw in locked-down embeddings, and resume() can reject — neither should
  // surface as a console error.
  function getCtx() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) {
      try { ctx = new AC(); }
      catch (e) { ctx = null; return null; }
    }
    if (ctx.state === 'suspended') {
      try { ctx.resume(); } catch (e) { /* stays suspended; play is silent, not broken */ }
    }
    return ctx;
  }

  // One oscillator note with a soft exponential attack/release envelope.
  // exponentialRamp can't target 0, so the envelope floors at 0.0001 and ramps
  // between that and `peak` — the soft edges keep short notes from clicking.
  function note(c, freq, start, dur, peak, type) {
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  // Warm two-note rising chime (~1s): A4 then a perfect-fifth-up E5, low gain,
  // soft envelopes. Synthesized conservatively — no attempt to mimic the real
  // Win98 startup sound. Plays at boot completion on the first user gesture.
  function playStartup() {
    if (!enabled) return;
    var c = getCtx();
    if (!c) return;
    try {
      var t = c.currentTime + 0.02;
      note(c, 440, t, 0.5, 0.13, 'sine');
      note(c, 659.25, t + 0.26, 0.7, 0.13, 'sine');
    } catch (e) { /* never let audio break the page */ }
  }

  // Short single tone with fast decay — the dialog "ding".
  function playError() {
    if (!enabled) return;
    var c = getCtx();
    if (!c) return;
    try {
      var t = c.currentTime + 0.01;
      note(c, 494, t, 0.22, 0.15, 'triangle');
    } catch (e) {}
  }

  // Brief descending pair — the recycle-bin "empty" gesture. Exposed to keep
  // the sound API complete, but left unwired: this build has no empty-bin
  // interaction to trigger it (the Recycle Bin window is view-only).
  function playRecycle() {
    if (!enabled) return;
    var c = getCtx();
    if (!c) return;
    try {
      var t = c.currentTime + 0.01;
      note(c, 520, t, 0.18, 0.12, 'triangle');
      note(c, 340, t + 0.10, 0.22, 0.12, 'triangle');
    } catch (e) {}
  }

  function setSoundEnabled(v) { enabled = !!v; }
  function isSoundEnabled() { return enabled; }

  // First post-boot gesture: unlock/create the context and fire the armed
  // chime once. Capture phase so it runs before app handlers; one-shot so a
  // later gesture doesn't replay it. If sound is disabled at this moment,
  // playStartup no-ops and no context is created — the chime is simply skipped.
  function onFirstGesture() {
    document.removeEventListener('pointerdown', onFirstGesture, true);
    document.removeEventListener('keydown', onFirstGesture, true);
    playStartup();
  }

  // Called from boot.js completeBoot (desktop boot path only — phones skip
  // boot and get no startup chime). Idempotent.
  function armStartup() {
    if (startupArmed) return;
    startupArmed = true;
    document.addEventListener('pointerdown', onFirstGesture, true);
    document.addEventListener('keydown', onFirstGesture, true);
  }

  window.Sounds = {
    playStartup: playStartup,
    playError: playError,
    playRecycle: playRecycle,
    setSoundEnabled: setSoundEnabled,
    isSoundEnabled: isSoundEnabled,
    armStartup: armStartup
  };
})();
