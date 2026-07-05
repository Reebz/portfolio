;(function() {
  'use strict';

  // Safari Private Browsing throws SecurityError on storage access.
  function safeGetItem(storage, key) {
    try { return storage.getItem(key); } catch (e) { return null; }
  }
  function safeSetItem(storage, key, value) {
    try { storage.setItem(key, value); } catch (e) {}
  }

  // Recovery path if anything wedges the boot sequence (AudioContext init
  // blocked, image decode hung, exception in a stage). Runs the full boot
  // teardown — clearing the 'booting' class alone would leave the opaque
  // #boot-overlay (z-index 99999) covering the viewport.
  var deadman = setTimeout(function() {
    console.warn('[boot] deadman fired');
    completeBoot();
  }, 15000);

  // Skip boot on phones (touch + small viewport), reduced motion, hash deep
  // links, or repeat visits. Tablets (touch + 768+) still run the boot sequence
  // — their screens are big enough that the full desktop experience works.
  if (safeGetItem(sessionStorage, 'booted') ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      window.matchMedia('(hover: none) and (pointer: coarse) and (max-width: 767px)').matches ||
      window.location.hash) {
    clearTimeout(deadman);
    document.body.classList.remove('booting');
    return;
  }

  // --- CGA BIOS Colors (per https://en.wikipedia.org/wiki/BIOS_color_attributes) ---
  // Reference: https://www.dosdays.co.uk/media/award/v4.51pg_startup.png
  // Default text is light gray (#AAAAAA), highlights are white (#FFFFFF)
  var LGRAY  = '#AAAAAA'; // CGA attribute 7 — standard body text
  var WHITE  = '#FFFFFF'; // CGA attribute F — highlighted text (F1, DEL)
  var BROWN  = '#AA5500'; // CGA attribute 6 — BIOS ID string at bottom

  // --- DOS Beep ---
  function dosBeep() {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 1000;
      gain.gain.value = 0.06;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {}
  }

  // --- Create overlay ---
  var overlay = document.createElement('div');
  overlay.id = 'boot-overlay';
  overlay.style.cssText =
    'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;' +
    'background:#000000;color:' + LGRAY + ';' +
    'font-family:"Perfect DOS VGA 437","Lucida Console","Courier New",monospace;' +
    'font-size:16px;line-height:1.4;cursor:default;overflow:hidden;padding:0;margin:0;';
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-label', 'System startup');
  document.body.appendChild(overlay);

  var desktop = document.getElementById('desktop');
  var taskbar = document.getElementById('taskbar');
  var startMenu = document.getElementById('start-menu');

  var stage = 0;
  var timers = [];
  var lineIndex;
  var outputEl;

  // Track every pending setTimeout so completeBoot can clear them all.
  // The previous `var timer` only held the last assignment, leaving stray
  // timers (e.g. the splash watchdog) free to fire on a detached overlay.
  function track(id) { timers.push(id); return id; }
  function clearTimers() {
    while (timers.length) clearTimeout(timers.pop());
  }

  // Highlight helper — bright white for emphasis
  function hi(text) { return '<span style="color:' + WHITE + '">' + text + '</span>'; }

  // --- POST Lines (matching Award BIOS v4.51PG reference exactly) ---
  var postLines = [
    { html: '\u25CF Award Modular BIOS v4.51PG, An Energy Star Ally', delay: 200 },
    { html: '\u25CF Copyright (C) 1984-98, Award Software, Inc.', delay: 300 },
    { html: '&nbsp;', delay: 200 },
    { html: 'PENTIUM II CPU at 233 MHz         , Host Bus  66MHz', delay: 500 },
    { html: 'Memory Test :   32768K OK', delay: 900 },
    { html: '&nbsp;', delay: 200 },
    { html: 'Award Plug and Play BIOS Extension v1.0A', delay: 300 },
    { html: 'Initialize Plug and Play Cards...', delay: 400 },
    { html: 'PNP Init Completed', delay: 300 },
    { html: '&nbsp;', delay: 200 },
    { html: '  Detecting IDE Primary Master   ... QUANTUM FIREBALL 4.3GB', delay: 450 },
    { html: '  Detecting IDE Primary Slave    ... CREATIVE 24X CD-ROM', delay: 450 },
    { html: '  Detecting IDE Secondary Master ... None', delay: 350 },
    { html: '  Detecting IDE Secondary Slave  ... None', delay: 350 },
    { html: '&nbsp;', delay: 200 },
    { html: 'PCI device listing:', delay: 300 },
    { html: '  Bus  0 Device  9: 3Dfx Voodoo2 (Creative Labs 3D Blaster)', delay: 400 },
    { html: '  Bus  0 Device 11: Creative Sound Blaster 16 at IRQ 5', delay: 400 },
    { html: '&nbsp;', delay: 250 },
    { html: 'Trend ChipAwayVirus(R) On Guard_', delay: 600 }
  ];

  // --- Stages ---
  function nextStage() {
    stage++;

    if (stage === 1) {
      // =============== POST SCREEN — black bg, light gray text ===============
      overlay.innerHTML =
        '<div style="position:relative;padding:8px 16px;height:100%;box-sizing:border-box;">' +
          // Energy Star logo — top right, LARGE per reference
          '<div style="position:absolute;top:0;right:0;text-align:center;">' +
            '<img src="img/energystar.png" alt="Energy Star"' +
            ' style="width:400px;height:auto;image-rendering:auto;opacity:0.95;">' +
          '</div>' +
          // POST output — left side, leave room for logo
          '<div id="post-output" style="max-width:calc(100% - 420px);"></div>' +
          // Bottom section — press F1/DEL + BIOS ID
          '<div id="post-bottom" style="position:absolute;bottom:12px;left:16px;display:none;">' +
            '<div>&nbsp;</div>' +
            '<div>Press ' + hi('F1') + ' to continue, ' + hi('DEL') + ' to enter SETUP</div>' +
            '<div style="color:' + BROWN + ';">03/25/2026-i440BX-W977-2A69KM4NC-00</div>' +
          '</div>' +
        '</div>';

      outputEl = document.getElementById('post-output');
      lineIndex = 0;
      typeNextLine();
      return;

    } else if (stage === 2) {
      // Show bottom text
      var bottom = document.getElementById('post-bottom');
      if (bottom) bottom.style.display = 'block';
      track(setTimeout(nextStage, 1500));

    } else if (stage === 3) {
      // =============== POST BEEP + BLACK SCREEN ===============
      dosBeep();
      overlay.innerHTML = '';
      track(setTimeout(nextStage, 600));

    } else if (stage === 4) {
      // =============== WINDOWS 98 STARTUP SPLASH ===============
      // Decode the splash image before painting the overlay so we never get a
      // black-flash-with-floating-progress-bar moment on slow connections.
      // Cap the wait at 200ms so a stalled image can't hold up boot indefinitely.
      var splashSrc = 'img/win98-boot-splash.webp';
      var splashImg = new Image();
      var paintedSplash = false;
      var paintSplash = function() {
        if (paintedSplash) return;
        paintedSplash = true;
        overlay.style.backgroundColor = '#000';
        overlay.style.backgroundImage = "url('" + splashSrc + "')";
        overlay.style.backgroundSize = 'cover';
        overlay.style.backgroundPosition = 'center center';
        overlay.style.backgroundRepeat = 'no-repeat';
        overlay.innerHTML =
          '<style>' +
            '@keyframes win98-progress {' +
              '0% { transform: translateX(-160px); }' +
              '100% { transform: translateX(480px); }' +
            '}' +
          '</style>' +
          '<div style="position:absolute;left:50%;bottom:32px;transform:translateX(-50%);width:480px;height:16px;background:linear-gradient(180deg,#0a1450 0%,#1a2c7a 100%);border:1px solid;border-color:#000820 #6378b8 #6378b8 #000820;box-shadow:inset 0 0 1px rgba(0,0,0,0.6);overflow:hidden;">' +
            '<div style="width:160px;height:100%;background:linear-gradient(90deg,rgba(72,116,232,0) 0%,rgba(72,116,232,0.55) 18%,#7aa6ff 50%,rgba(72,116,232,0.55) 82%,rgba(72,116,232,0) 100%);animation:win98-progress 1.6s linear infinite;"></div>' +
          '</div>';
        track(setTimeout(nextStage, 2200));
      };
      splashImg.onload = paintSplash;
      splashImg.onerror = paintSplash;
      splashImg.src = splashSrc;
      track(setTimeout(paintSplash, 200));

    } else {
      completeBoot();
    }
  }

  function typeNextLine() {
    if (stage !== 1) return;
    if (lineIndex >= postLines.length) {
      track(setTimeout(nextStage, 1000));
      return;
    }

    var line = postLines[lineIndex];
    if (outputEl) {
      var div = document.createElement('div');
      div.innerHTML = line.html;
      outputEl.appendChild(div);
    }
    lineIndex++;
    track(setTimeout(typeNextLine, line.delay));
  }

  function completeBoot() {
    clearTimers();
    clearTimeout(deadman);
    safeSetItem(sessionStorage, 'booted', '1');
    overlay.style.transition = 'opacity 0.4s';
    overlay.style.opacity = '0';
    document.body.classList.remove('booting');
    setTimeout(function() { overlay.remove(); }, 400);
    // Always unbind the keydown listener — both the click-skip and the keydown-
    // skip paths flow through here. Without this, click-skip leaves the listener
    // bound for the lifetime of the tab.
    document.removeEventListener('keydown', onSkipKey);
  }

  // Skip on click or keypress
  function onSkipKey() {
    if (document.getElementById('boot-overlay')) completeBoot();
  }
  overlay.addEventListener('click', completeBoot);
  document.addEventListener('keydown', onSkipKey);

  nextStage();
})();
