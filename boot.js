;(function() {
  'use strict';

  // Skip boot on touch devices, reduced motion, hash deep links, or repeat visits
  if (sessionStorage.getItem('booted') ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      window.matchMedia('(hover: none) and (pointer: coarse)').matches ||
      window.location.hash) {
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
  var timer;
  var lineIndex;
  var outputEl;

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
      timer = setTimeout(nextStage, 1500);

    } else if (stage === 3) {
      // =============== POST BEEP + BLACK SCREEN ===============
      dosBeep();
      overlay.innerHTML = '';
      timer = setTimeout(nextStage, 600);

    } else if (stage === 4) {
      // =============== WINDOWS 98 STARTUP SPLASH ===============
      overlay.style.backgroundColor = '#000';
      overlay.style.backgroundImage = "url('img/win98-boot-splash.webp')";
      overlay.style.backgroundSize = 'cover';
      overlay.style.backgroundPosition = 'center center';
      overlay.style.backgroundRepeat = 'no-repeat';
      overlay.innerHTML =
        '<style>' +
          '@keyframes win98-progress {' +
            '0% { transform: translateX(-44px); }' +
            '100% { transform: translateX(220px); }' +
          '}' +
        '</style>' +
        '<div style="position:absolute;left:50%;bottom:9vh;transform:translateX(-50%);width:220px;height:14px;background:#000;border:1px solid;border-color:#7d7d7d #f5f5f5 #f5f5f5 #7d7d7d;overflow:hidden;">' +
          '<div style="width:44px;height:100%;background:#1d4eb6;animation:win98-progress 1.4s linear infinite;"></div>' +
        '</div>';
      timer = setTimeout(nextStage, 2200);

    } else {
      completeBoot();
    }
  }

  function typeNextLine() {
    if (stage !== 1) return;
    if (lineIndex >= postLines.length) {
      timer = setTimeout(nextStage, 1000);
      return;
    }

    var line = postLines[lineIndex];
    if (outputEl) {
      var div = document.createElement('div');
      div.innerHTML = line.html;
      outputEl.appendChild(div);
    }
    lineIndex++;
    timer = setTimeout(typeNextLine, line.delay);
  }

  function completeBoot() {
    clearTimeout(timer);
    sessionStorage.setItem('booted', '1');
    overlay.style.transition = 'opacity 0.4s';
    overlay.style.opacity = '0';
    document.body.classList.remove('booting');
    setTimeout(function() { overlay.remove(); }, 400);
  }

  // Skip on click or keypress
  overlay.addEventListener('click', completeBoot);
  document.addEventListener('keydown', function onKey() {
    if (document.getElementById('boot-overlay')) {
      completeBoot();
      document.removeEventListener('keydown', onKey);
    }
  });

  nextStage();
})();
