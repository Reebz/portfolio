;(function() {
  'use strict';

  /* ============================================================
     desktop.js — Window management for Win98 portfolio
     ============================================================ */

  // --- Constants ---
  var TASKBAR_HEIGHT = 28;
  var MIN_WIN_SIZE = { w: 300, h: 200 };
  var DBLCLICK_DELAY = 300;
  // Drag clamps: minimum on-screen sliver kept visible during window drag so the
  // user can always grab the title bar back from the viewport edges.
  var DRAG_EDGE_MARGIN_X = 100; // px kept visible on the right edge
  var DRAG_EDGE_MARGIN_Y = 30;  // px kept visible above the taskbar

  // --- Project Data ---
  var PROJECTS = [
    {
      id: 'always-draft',
      title: 'Always dRaft',
      description: 'Blog',
      tech: [],
      url: null,
      type: 'construction',
      screenshot: null,
      updated: '2026-03-26',
      icon: 'img/icons/blog.png'
    },
    {
      id: 'claude-battery',
      title: 'Claude Battery',
      description: 'AI tool',
      tech: [],
      url: 'https://claudebattery.com/',
      type: 'link',
      screenshot: null,
      updated: '2026-03-26',
      icon: 'img/icons/battery.png'
    },
    {
      id: 'avails-click',
      title: 'Avails Click',
      description: 'Coming soon',
      tech: [],
      url: null,
      type: 'construction',
      screenshot: null,
      updated: '2026-03-26',
      icon: 'img/icons/calendar.png'
    },
    {
      id: 'linkedin',
      title: 'LinkedIn',
      description: 'Professional profile',
      tech: [],
      url: 'https://www.linkedin.com/in/mitchribar/',
      type: 'link',
      screenshot: null,
      updated: '2026-03-26',
      icon: 'img/icons/linkedin.png'
    },
    {
      id: 'obsidian-game',
      title: 'Obsidian Game',
      description: 'Game project',
      tech: [],
      url: null,
      type: 'construction',
      screenshot: null,
      updated: '2026-03-26',
      icon: 'img/icons/game.png'
    },
    {
      id: 'microgram',
      title: 'Microgram',
      description: 'Coming soon',
      tech: [],
      url: null,
      type: 'construction',
      screenshot: null,
      updated: '2026-03-27',
      icon: 'img/icons/microgram.png'
    },
    {
      id: 'prototypist',
      title: 'Prototypist',
      description: 'Coming soon',
      tech: [],
      url: null,
      type: 'construction',
      screenshot: null,
      updated: '2026-03-27',
      icon: 'img/icons/prototypist.png'
    },
    {
      id: 'cavaro',
      title: 'Cavaro',
      description: 'Stealth mode',
      tech: [],
      url: null,
      type: 'cavaro',
      screenshot: null,
      updated: '2026-03-27',
      icon: 'img/icons/cavaro.png'
    },
    {
      id: 'snowball-dodge',
      title: 'Snowball Dodge',
      description: 'Coming soon',
      tech: [],
      url: null,
      type: 'construction',
      screenshot: null,
      updated: '2026-03-28',
      icon: 'img/icons/snowball.png'
    }
  ];

  // Non-project windows (hand-authored in HTML)
  var SYSTEM_WINDOWS = ['about', 'guestbook', 'contact', 'my-computer', 'recycle-bin', 'visitor-counter', 'clock', 'shutdown'];

  // All valid window IDs (for hash routing whitelist)
  var VALID_WINDOWS = new Set();

  // --- State ---
  var windows = new Map(); // id -> { state, prevRect, el, taskbarBtn, transient }
  var zCounter = 10;
  var activeWindowId = null;
  var cascadeIndex = 0;
  var clickTimeouts = new Map(); // iconId -> timeout

  // Single source of truth for registering a window with both the routing whitelist
  // and the lifecycle map. Every window-creation path flows through this.
  function registerWindow(id, el, opts) {
    opts = opts || {};
    VALID_WINDOWS.add(id);
    windows.set(id, {
      state: 'closed',
      prevRect: null,
      el: el,
      taskbarBtn: null,
      transient: !!opts.transient,
    });
  }

  // --- DOM References (cached at init) ---
  var elDesktop, elIconGrid, elTaskbar, elTaskbarButtons;
  var elStartMenu, elStartButton;
  var elClock, elVisitorCounter, elAnnouncer;

  // --- Announcer ---
  function announce(message) {
    if (!elAnnouncer) return;
    elAnnouncer.textContent = '';
    requestAnimationFrame(function() {
      elAnnouncer.textContent = message;
    });
  }

  // --- Z-Index ---
  function bringToFront(windowId) {
    var win = windows.get(windowId);
    if (!win || !win.el) return;

    zCounter++;
    win.el.style.zIndex = zCounter;

    // Update active/inactive visual states
    if (activeWindowId && activeWindowId !== windowId) {
      var prev = windows.get(activeWindowId);
      if (prev && prev.el) {
        var prevBar = prev.el.querySelector('.title-bar');
        if (prevBar) prevBar.classList.add('inactive');
      }
      // Update taskbar button
      if (prev && prev.taskbarBtn) {
        prev.taskbarBtn.setAttribute('aria-pressed', 'false');
      }
    }

    var bar = win.el.querySelector('.title-bar');
    if (bar) bar.classList.remove('inactive');
    if (win.taskbarBtn) {
      win.taskbarBtn.setAttribute('aria-pressed', 'true');
    }

    activeWindowId = windowId;
  }


  // --- Window Operations ---
  function openWindow(id) {
    var win = windows.get(id);
    if (!win) return;

    if (win.state === 'open' || win.state === 'maximized') {
      bringToFront(id);
      win.el.focus();
      return;
    }

    if (win.state === 'minimized') {
      restoreWindow(id);
      return;
    }

    // Position window (cascade from top-left, wrap at 10)
    var offset = 30 + (cascadeIndex * 22);
    cascadeIndex = (cascadeIndex + 1) % 10;
    win.el.style.left = offset + 'px';
    win.el.style.top = offset + 'px';
    if (!win.el.style.width) win.el.style.width = '500px';
    win.el.style.transform = '';

    win.state = 'open';
    win.el.setAttribute('data-state', 'open');
    bringToFront(id);
    win.el.focus();

    // Create taskbar button
    createTaskbarButton(id, win);

    // Update hash
    updateHash(id);

    announce(getTitleText(win.el) + ' opened');
  }

  function closeWindow(id) {
    var win = windows.get(id);
    if (!win || win.state === 'closed') return;

    // Cavaro self-destruct: save dismissal and remove icon
    if (id === 'window-cavaro') {
      localStorage.setItem('cavaro-dismissed', Date.now());
      var cavaroIcon = elIconGrid.querySelector('[data-window-id="window-cavaro"]');
      if (cavaroIcon) cavaroIcon.remove();
    }

    // Cancel matrix rain animation if closing the matrix window
    if (id === 'window-matrix') {
      var matrixCanvas = document.getElementById('matrix-canvas');
      if (matrixCanvas && matrixCanvas._rafId) cancelAnimationFrame(matrixCanvas._rafId);
    }

    // Stop analogue clock if closing the clock window
    if (id === 'window-clock') stopAnalogueClock();

    win.state = 'closed';
    win.el.setAttribute('data-state', 'closed');
    win.el.style.transform = '';
    // Reset all positioning so the next open path (cascade or tray-anchored) starts clean.
    win.el.style.position = '';
    win.el.style.left = '';
    win.el.style.right = '';
    win.el.style.top = '';
    win.el.style.bottom = '';

    // Reset Contact form Send button so a mid-flight close doesn't brick it on reopen.
    if (id === 'window-contact') {
      var sendBtn = win.el.querySelector('button[type="submit"]');
      if (sendBtn) { sendBtn.textContent = 'Send'; sendBtn.disabled = false; }
    }

    // Remove taskbar button
    if (win.taskbarBtn) {
      win.taskbarBtn.remove();
      win.taskbarBtn = null;
    }

    // Focus next window or desktop
    if (activeWindowId === id) {
      activeWindowId = null;
      focusNextWindow();
    }

    updateHash(activeWindowId);
    announce(getTitleText(win.el) + ' closed');

    // Transient windows (e.g. Notepad — one DOM node per launch) get fully torn down
    // so the DOM and the windows registry don't accumulate forever.
    if (win.transient) {
      win.el.remove();
      windows.delete(id);
      VALID_WINDOWS.delete(id);
    }
  }

  function minimizeWindow(id) {
    var win = windows.get(id);
    if (!win || win.state !== 'open' && win.state !== 'maximized') return;

    // Save position before minimize
    if (win.state === 'open') {
      win.prevRect = getWindowRect(win.el);
    }

    win.state = 'minimized';
    win.el.setAttribute('data-state', 'minimized');
    win.el.style.display = 'none';

    // Update taskbar button
    if (win.taskbarBtn) {
      win.taskbarBtn.setAttribute('aria-pressed', 'false');
    }

    if (activeWindowId === id) {
      activeWindowId = null;
      focusNextWindow();
    }

    announce(getTitleText(win.el) + ' minimized');
  }

  function restoreWindow(id) {
    var win = windows.get(id);
    if (!win) return;

    if (win.state === 'minimized') {
      win.state = 'open';
      win.el.setAttribute('data-state', 'open');
      win.el.style.display = '';

      if (win.prevRect) {
        win.el.style.left = win.prevRect.x + 'px';
        win.el.style.top = win.prevRect.y + 'px';
        win.el.style.width = win.prevRect.w + 'px';
        win.el.style.height = win.prevRect.h + 'px';
      }

      bringToFront(id);
      win.el.focus();
      announce(getTitleText(win.el) + ' restored');
    }
  }

  function toggleMaximize(id) {
    var win = windows.get(id);
    if (!win) return;

    if (win.state === 'maximized') {
      // Restore
      win.state = 'open';
      win.el.setAttribute('data-state', 'open');
      if (win.prevRect) {
        win.el.style.left = win.prevRect.x + 'px';
        win.el.style.top = win.prevRect.y + 'px';
        win.el.style.width = win.prevRect.w + 'px';
        win.el.style.height = win.prevRect.h + 'px';
      }
      announce(getTitleText(win.el) + ' restored');
    } else if (win.state === 'open') {
      // Save current rect then maximize
      win.prevRect = getWindowRect(win.el);
      win.state = 'maximized';
      win.el.setAttribute('data-state', 'maximized');
      announce(getTitleText(win.el) + ' maximized');
    }

    bringToFront(id);
  }

  function focusNextWindow() {
    var highest = null;
    var highestZ = -1;
    windows.forEach(function(win, id) {
      if ((win.state === 'open' || win.state === 'maximized') && win.el) {
        var z = parseInt(win.el.style.zIndex) || 0;
        if (z > highestZ) {
          highestZ = z;
          highest = id;
        }
      }
    });
    if (highest) {
      bringToFront(highest);
    }
  }

  // --- Taskbar Buttons ---
  function createTaskbarButton(id, win) {
    if (win.taskbarBtn) return;

    var btn = document.createElement('button');
    btn.className = 'taskbar-window-btn';
    btn.setAttribute('data-window-id', id);
    btn.setAttribute('aria-pressed', 'true');
    btn.textContent = getTitleText(win.el);
    elTaskbarButtons.appendChild(btn);
    win.taskbarBtn = btn;
  }

  // --- Drag System ---
  var dragState = {
    active: false,
    windowId: null,
    offsetX: 0,
    offsetY: 0,
    pendingX: 0,
    pendingY: 0,
    startX: 0,
    startY: 0,
    rafId: null,
    suppressClick: false
  };

  // --- Resize System ---
  var RESIZE_ZONE = 8; // px from edge to trigger resize
  var resizeState = {
    active: false,
    windowId: null,
    edge: null,    // 'n','ne','e','se','s','sw','w','nw'
    startRect: null, // { x, y, w, h }
    startX: 0,
    startY: 0,
    rafId: null
  };

  function getResizeEdge(e, winEl) {
    var rect = winEl.getBoundingClientRect();
    var z = getZoom();
    var x = e.clientX;
    var y = e.clientY;
    var nearL = x - rect.left < RESIZE_ZONE;
    var nearR = rect.right - x < RESIZE_ZONE;
    var nearT = y - rect.top < RESIZE_ZONE;
    var nearB = rect.bottom - y < RESIZE_ZONE;

    if (nearT && nearL) return 'nw';
    if (nearT && nearR) return 'ne';
    if (nearB && nearL) return 'sw';
    if (nearB && nearR) return 'se';
    if (nearT) return 'n';
    if (nearB) return 's';
    if (nearL) return 'w';
    if (nearR) return 'e';
    return null;
  }

  var EDGE_CURSORS = {
    n: 'n-resize', ne: 'ne-resize', e: 'e-resize', se: 'se-resize',
    s: 's-resize', sw: 'sw-resize', w: 'w-resize', nw: 'nw-resize'
  };

  function onResizeStart(e, windowId, edge) {
    var win = windows.get(windowId);
    if (!win || win.state === 'maximized') return;
    if (win.el.getAttribute('data-no-resize') === 'true') return;

    var z = getZoom();
    resizeState.active = true;
    resizeState.windowId = windowId;
    resizeState.edge = edge;
    resizeState.startX = e.clientX;
    resizeState.startY = e.clientY;
    resizeState.startRect = {
      x: parseInt(win.el.style.left) || 0,
      y: parseInt(win.el.style.top) || 0,
      w: win.el.offsetWidth / z,
      h: win.el.offsetHeight / z
    };

    // Disable pointer events on iframes during resize
    win.el.querySelectorAll('iframe').forEach(function(iframe) {
      iframe.style.pointerEvents = 'none';
    });

    e.target.setPointerCapture(e.pointerId);
    bringToFront(windowId);
  }

  function onResizeMove(e) {
    if (!resizeState.active) return;
    if (!e.target.hasPointerCapture(e.pointerId)) return;

    var z = getZoom();
    var dx = (e.clientX - resizeState.startX) / z;
    var dy = (e.clientY - resizeState.startY) / z;
    var sr = resizeState.startRect;
    var edge = resizeState.edge;

    var newX = sr.x, newY = sr.y, newW = sr.w, newH = sr.h;

    // East
    if (edge === 'e' || edge === 'ne' || edge === 'se') {
      newW = Math.max(MIN_WIN_SIZE.w, sr.w + dx);
    }
    // West
    if (edge === 'w' || edge === 'nw' || edge === 'sw') {
      var proposedW = sr.w - dx;
      if (proposedW >= MIN_WIN_SIZE.w) {
        newW = proposedW;
        newX = sr.x + dx;
      } else {
        newW = MIN_WIN_SIZE.w;
        newX = sr.x + (sr.w - MIN_WIN_SIZE.w);
      }
    }
    // South
    if (edge === 's' || edge === 'se' || edge === 'sw') {
      newH = Math.max(MIN_WIN_SIZE.h, sr.h + dy);
    }
    // North
    if (edge === 'n' || edge === 'ne' || edge === 'nw') {
      var proposedH = sr.h - dy;
      if (proposedH >= MIN_WIN_SIZE.h) {
        newH = proposedH;
        newY = sr.y + dy;
      } else {
        newH = MIN_WIN_SIZE.h;
        newY = sr.y + (sr.h - MIN_WIN_SIZE.h);
      }
    }

    if (!resizeState.rafId) {
      resizeState.rafId = requestAnimationFrame(function() {
        resizeState.rafId = null;
        var win = windows.get(resizeState.windowId);
        if (win && win.el) {
          win.el.style.left = newX + 'px';
          win.el.style.top = newY + 'px';
          win.el.style.width = newW + 'px';
          win.el.style.height = newH + 'px';
        }
      });
    }
  }

  function onResizeEnd(e) {
    if (!resizeState.active) return;
    var win = windows.get(resizeState.windowId);

    if (resizeState.rafId) {
      cancelAnimationFrame(resizeState.rafId);
      resizeState.rafId = null;
    }

    // Re-enable iframe pointer events
    if (win && win.el) {
      win.el.querySelectorAll('iframe').forEach(function(iframe) {
        iframe.style.pointerEvents = '';
      });
    }

    e.target.releasePointerCapture(e.pointerId);
    resizeState.active = false;
    resizeState.windowId = null;
    resizeState.edge = null;
  }

  function onDragStart(e, windowId) {
    var win = windows.get(windowId);
    if (!win || win.state === 'maximized') return;

    var rect = win.el.getBoundingClientRect();
    dragState.windowId = windowId;
    dragState.offsetX = e.clientX - rect.left;
    dragState.offsetY = e.clientY - rect.top;
    dragState.startX = e.clientX;
    dragState.startY = e.clientY;
    dragState.active = false;

    e.target.setPointerCapture(e.pointerId);
    bringToFront(windowId);
  }

  function onDragMove(e) {
    if (!dragState.windowId) return;
    if (!e.target.hasPointerCapture(e.pointerId)) return;

    var dx = e.clientX - dragState.startX;
    var dy = e.clientY - dragState.startY;

    // Drag threshold: 3px
    if (!dragState.active && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      dragState.active = true;
      var win = windows.get(dragState.windowId);
      if (win) win.el.style.willChange = 'transform';
    }

    if (!dragState.active) return;

    var x = e.clientX - dragState.offsetX;
    var y = e.clientY - dragState.offsetY;

    // Constrain to viewport
    x = Math.max(0, Math.min(x, window.innerWidth - DRAG_EDGE_MARGIN_X));
    y = Math.max(0, Math.min(y, window.innerHeight - TASKBAR_HEIGHT - DRAG_EDGE_MARGIN_Y));

    dragState.pendingX = x;
    dragState.pendingY = y;

    if (!dragState.rafId) {
      dragState.rafId = requestAnimationFrame(function() {
        dragState.rafId = null;
        var z = getZoom();
        var win = windows.get(dragState.windowId);
        if (win && win.el) {
          win.el.style.left = (dragState.pendingX / z) + 'px';
          win.el.style.top = (dragState.pendingY / z) + 'px';
        }
      });
    }
  }

  function onDragEnd(e) {
    if (!dragState.windowId) return;

    var win = windows.get(dragState.windowId);

    if (dragState.rafId) {
      cancelAnimationFrame(dragState.rafId);
      dragState.rafId = null;
    }

    if (dragState.active && win && win.el) {
      // Apply final position synchronously
      var z = getZoom();
      win.el.style.left = (dragState.pendingX / z) + 'px';
      win.el.style.top = (dragState.pendingY / z) + 'px';
      win.el.style.willChange = '';
      dragState.suppressClick = true;
    }

    e.target.releasePointerCapture(e.pointerId);
    dragState.windowId = null;
    dragState.active = false;
  }

  // Suppress click after drag (capture phase)
  document.addEventListener('click', function(e) {
    if (dragState.suppressClick) {
      dragState.suppressClick = false;
      e.stopPropagation();
    }
  }, true);

  // --- Hash Routing ---
  var isHandlingHash = false;

  function updateHash(windowId) {
    if (isHandlingHash) return;
    if (windowId) {
      window.location.hash = '#' + windowId;
    } else {
      // Remove hash without scrolling
      history.replaceState(null, '', window.location.pathname);
    }
  }

  // Single source of truth for app dispatch. Keyed by the data-app value used
  // on Start-menu items. The Start-menu click delegator and the hash deep-link
  // router both consult this; adding a new app means one entry here, not three
  // edits across a switch ladder, a hash map, and the menu HTML.
  function APP_LAUNCHERS_GETTER() {
    return {
      paint: launchPaint,
      minesweeper: launchMinesweeper,
      calculator: launchCalculator,
      help: launchHelpBook,
      run: launchRun,
      notepad: launchNotepad,
      napster: launchNapster,
      icq: launchICQ,
    };
  }
  // Late-bound table so all launchers are hoisted and visible when accessed.
  var APP_LAUNCHERS;
  function getAppLaunchers() {
    if (!APP_LAUNCHERS) APP_LAUNCHERS = APP_LAUNCHERS_GETTER();
    return APP_LAUNCHERS;
  }

  // Hash deep-links to windows that aren't created until their launcher runs
  // need a way to bring those windows into existence on first reach. Window-id
  // keys map to the same launcher functions APP_LAUNCHERS uses by app name.
  function getLaunchableWindowMap() {
    var L = getAppLaunchers();
    return {
      'window-paint': L.paint,
      'window-calculator': L.calculator,
      'window-minesweeper': L.minesweeper,
      'window-help-book': L.help,
      'window-run-dialog': L.run,
      'window-napster': L.napster,
      'window-icq': L.icq,
    };
  }

  function applyHashState() {
    var hash = window.location.hash.slice(1);
    if (!hash) return;
    isHandlingHash = true;
    if (VALID_WINDOWS.has(hash)) {
      openWindow(hash);
    } else {
      var launchers = getLaunchableWindowMap();
      if (launchers[hash]) launchers[hash]();
    }
    isHandlingHash = false;
  }

  var hashDebounce = null;
  window.addEventListener('hashchange', function() {
    if (hashDebounce) clearTimeout(hashDebounce);
    hashDebounce = setTimeout(function() {
      hashDebounce = null;
      applyHashState();
    }, 100);
  });

  // --- Start Menu ---
  function handleGlobalClick(e) {
    var startBtn = document.getElementById('start-button');
    var menu = document.getElementById('start-menu');

    if (startBtn && startBtn.contains(e.target)) {
      menu.classList.toggle('open');
      var isOpen = menu.classList.contains('open');
      startBtn.setAttribute('aria-expanded', isOpen);
      if (isOpen) {
        var firstItem = menu.querySelector('[role="menuitem"]');
        if (firstItem) firstItem.focus();
      }
      return;
    }

    if (menu && !menu.contains(e.target)) {
      menu.classList.remove('open');
      if (startBtn) startBtn.setAttribute('aria-expanded', 'false');
      closeAllSubmenus();
    }
  }

  // --- Clock (Sydney, Australia timezone) ---
  var TIMEZONE = 'Australia/Sydney';

  // Build a Date-equivalent { hours, minutes } for the configured timezone via
  // Intl.DateTimeFormat.formatToParts. The previous toLocaleString round-trip
  // was implementation-defined for non-ISO date strings and could degrade in
  // some locales/engines.
  function getSydneyTimeParts() {
    var parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      hour: 'numeric',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    var hour = 0, minute = 0;
    parts.forEach(function(p) {
      if (p.type === 'hour') hour = parseInt(p.value, 10) % 24;
      else if (p.type === 'minute') minute = parseInt(p.value, 10);
    });
    return { hours: hour, minutes: minute };
  }

  function getSydneyTime() {
    var p = getSydneyTimeParts();
    var d = new Date();
    d.setHours(p.hours, p.minutes, 0, 0);
    return d;
  }

  function formatTime12h(date) {
    var h = date.getHours();
    var m = date.getMinutes();
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    m = m < 10 ? '0' + m : m;
    return h + ':' + m + ' ' + ampm;
  }

  function startClock() {
    function tick() {
      if (!elClock) return;
      var syd = getSydneyTime();
      elClock.textContent = formatTime12h(syd);

      // Schedule next tick at start of next minute
      var now = new Date();
      var msUntilNext = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
      setTimeout(tick, msUntilNext);
    }
    tick();
  }

  // --- Analogue Clock ---
  var analogueClockInterval = null;

  function startAnalogueClock() {
    var canvas = document.getElementById('analogue-clock');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.width;
    var h = canvas.height;
    var cx = w / 2;
    var cy = h / 2;
    var r = Math.min(cx, cy) - 8;

    var digitalEl = document.getElementById('clock-digital-time');
    var dateEl = document.getElementById('clock-date');
    var tzOffsetEl = document.getElementById('clock-timezone-offset');

    function draw() {
      var syd = getSydneyTime();
      var hrs = syd.getHours() % 12;
      var mins = syd.getMinutes();
      var secs = syd.getSeconds();

      ctx.clearRect(0, 0, w, h);

      // Clock face
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Hour markers
      for (var i = 0; i < 12; i++) {
        var angle = (i * Math.PI / 6) - Math.PI / 2;
        var inner = r - 10;
        var outer = r - 2;
        ctx.beginPath();
        ctx.moveTo(cx + inner * Math.cos(angle), cy + inner * Math.sin(angle));
        ctx.lineTo(cx + outer * Math.cos(angle), cy + outer * Math.sin(angle));
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Hour numbers
      ctx.fillStyle = '#000';
      ctx.font = '11px "Pixelated MS Sans Serif", Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (var n = 1; n <= 12; n++) {
        var na = (n * Math.PI / 6) - Math.PI / 2;
        ctx.fillText(n, cx + (r - 20) * Math.cos(na), cy + (r - 20) * Math.sin(na));
      }

      // Hour hand
      var hAngle = ((hrs + mins / 60) * Math.PI / 6) - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + (r * 0.5) * Math.cos(hAngle), cy + (r * 0.5) * Math.sin(hAngle));
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Minute hand
      var mAngle = ((mins + secs / 60) * Math.PI / 30) - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + (r * 0.7) * Math.cos(mAngle), cy + (r * 0.7) * Math.sin(mAngle));
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Second hand
      var sAngle = (secs * Math.PI / 30) - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + (r * 0.75) * Math.cos(sAngle), cy + (r * 0.75) * Math.sin(sAngle));
      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Center dot
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#000';
      ctx.fill();

      // Update digital readout
      if (digitalEl) digitalEl.textContent = formatTime12h(syd) + ':' + (secs < 10 ? '0' : '') + secs;
      if (dateEl) dateEl.textContent = syd.toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      if (tzOffsetEl) {
        var isDST = syd.toLocaleString('en-US', { timeZone: TIMEZONE, timeZoneName: 'short' }).includes('DT');
        tzOffsetEl.textContent = isDST ? 'AEDT (UTC+11:00)' : 'AEST (UTC+10:00)';
      }
    }

    draw();
    analogueClockInterval = setInterval(draw, 1000);
  }

  function stopAnalogueClock() {
    if (analogueClockInterval) {
      clearInterval(analogueClockInterval);
      analogueClockInterval = null;
    }
  }

  // --- Visitor Counter ---
  // GoatCounter exposes a public TOTAL.json counter once "Allow adding visitor
  // counts on your website" is enabled in the site settings. We render the
  // cached value first for instant paint, then refresh from the live endpoint
  // (gated by a session-local 30-minute timestamp matching GoatCounter's server
  // cache window) and fall back to the legacy localStorage-incrementing counter
  // if both the cache and the network are unavailable.
  var COUNTER_URL = 'https://reebz.goatcounter.com/counter/TOTAL.json';
  var COUNTER_CACHE_KEY = 'visitor-count-cache';
  var COUNTER_FETCHED_AT_KEY = 'counter-fetched-at';
  var COUNTER_FETCH_TTL_MS = 30 * 60 * 1000;

  // Single source of formatting truth so cached, live-fetched, and fallback
  // values all render identically. Accepts a number, a numeric string, or an
  // already-formatted "1,234" string. Returns null for anything we can't parse,
  // which the callers treat as a signal to keep the prior display.
  function formatCount(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'string' && /^\d{1,3}(,\d{3})+$/.test(value)) return value;
    var n = typeof value === 'number' ? value : parseInt(String(value).replace(/,/g, ''), 10);
    if (!Number.isFinite(n) || n < 0) return null;
    return n.toLocaleString();
  }

  function renderVisitorCount(value) {
    if (elVisitorCounter) elVisitorCounter.textContent = value;
    var counterDisplay = document.getElementById('counter-display');
    if (counterDisplay) counterDisplay.textContent = value;
  }

  function localFallbackCount() {
    var count = parseInt(localStorage.getItem('visitor-count')) || 3;
    if (!sessionStorage.getItem('counted')) {
      count++;
      sessionStorage.setItem('counted', '1');
      localStorage.setItem('visitor-count', count);
    }
    return formatCount(count);
  }

  function initVisitorCounter() {
    if (!elVisitorCounter) return;

    var cached = formatCount(localStorage.getItem(COUNTER_CACHE_KEY));
    renderVisitorCount(cached || localFallbackCount());

    if (typeof fetch !== 'function') return;

    // Skip the network round-trip if we already fetched within the server cache window.
    var fetchedAt = parseInt(sessionStorage.getItem(COUNTER_FETCHED_AT_KEY), 10);
    if (Number.isFinite(fetchedAt) && Date.now() - fetchedAt < COUNTER_FETCH_TTL_MS) return;

    fetch(COUNTER_URL)
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(data) {
        if (!data) return;
        var formatted = formatCount(data.count);
        if (!formatted) return;
        localStorage.setItem(COUNTER_CACHE_KEY, formatted);
        sessionStorage.setItem(COUNTER_FETCHED_AT_KEY, String(Date.now()));
        renderVisitorCount(formatted);
      })
      .catch(function() { /* keep cached/fallback display */ });
  }

  // --- System Tray Click Handlers ---
  function setupSystemTrayClicks() {
    if (elVisitorCounter) {
      elVisitorCounter.style.cursor = 'default';
      elVisitorCounter.addEventListener('click', function(e) {
        e.stopPropagation();
        var win = windows.get('window-visitor-counter');
        if (win && (win.state === 'open' || win.state === 'maximized')) {
          closeWindow('window-visitor-counter');
        } else {
          // Position near the system tray
          openWindow('window-visitor-counter');
          if (win && win.el) {
            win.el.style.left = 'auto';
            win.el.style.right = '80px';
            win.el.style.top = 'auto';
            win.el.style.bottom = (TASKBAR_HEIGHT + 4) + 'px';
            win.el.style.position = 'fixed';
          }
        }
      });
    }

    if (elClock) {
      elClock.style.cursor = 'default';
      elClock.addEventListener('click', function(e) {
        e.stopPropagation();
        var win = windows.get('window-clock');
        if (win && (win.state === 'open' || win.state === 'maximized')) {
          closeWindow('window-clock');
          stopAnalogueClock();
        } else {
          openWindow('window-clock');
          startAnalogueClock();
          if (win && win.el) {
            win.el.style.left = 'auto';
            win.el.style.right = '4px';
            win.el.style.top = 'auto';
            win.el.style.bottom = (TASKBAR_HEIGHT + 4) + 'px';
            win.el.style.position = 'fixed';
          }
        }
      });
    }
  }

  // --- Icon Drag (rearrange desktop icons) ---
  var iconDragState = {
    active: false,
    iconEl: null,
    offsetX: 0,
    offsetY: 0,
    startX: 0,
    startY: 0,
    moved: false,
    rafId: null
  };

  function layoutIcons() {
    // U3: on touch devices CSS Grid governs icon placement (see the
    // mobile @media blocks in style.css). Bailing here also skips the
    // localStorage 'icon-positions' restore — drag-to-rearrange is a
    // mouse affordance, so persisted positions are mouse-only state.
    if (isMobile()) return;

    var icons = elIconGrid.querySelectorAll('.desktop-icon');
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem('icon-positions')); } catch(e) {}

    var cellW = 80;
    var cellH = 90;
    var padding = 8;
    var gridHeight = elIconGrid.clientHeight || (window.innerHeight - TASKBAR_HEIGHT);
    var cols = Math.max(1, Math.floor(gridHeight / cellH));

    icons.forEach(function(icon, i) {
      var id = icon.getAttribute('data-window-id') || ('icon-' + i);
      if (saved && saved[id]) {
        icon.style.left = saved[id].x + 'px';
        icon.style.top = saved[id].y + 'px';
      } else {
        // Column-first layout (top to bottom, then next column)
        var col = Math.floor(i / cols);
        var row = i % cols;
        icon.style.left = (padding + col * cellW) + 'px';
        icon.style.top = (padding + row * cellH) + 'px';
      }
    });
  }

  function saveIconPositions() {
    var icons = elIconGrid.querySelectorAll('.desktop-icon');
    var positions = {};
    icons.forEach(function(icon, i) {
      var id = icon.getAttribute('data-window-id') || ('icon-' + i);
      positions[id] = {
        x: parseInt(icon.style.left) || 0,
        y: parseInt(icon.style.top) || 0
      };
    });
    localStorage.setItem('icon-positions', JSON.stringify(positions));
  }

  function setupIconDrag() {
    elIconGrid.addEventListener('pointerdown', function(e) {
      var icon = e.target.closest('.desktop-icon');
      if (!icon) return;

      var z = getZoom();
      var rect = icon.getBoundingClientRect();
      iconDragState.iconEl = icon;
      iconDragState.offsetX = e.clientX - rect.left;
      iconDragState.offsetY = e.clientY - rect.top;
      iconDragState.startX = e.clientX;
      iconDragState.startY = e.clientY;
      iconDragState.moved = false;
      iconDragState.active = true;

      icon.setPointerCapture(e.pointerId);
    });

    elIconGrid.addEventListener('pointermove', function(e) {
      if (!iconDragState.active || !iconDragState.iconEl) return;
      if (!iconDragState.iconEl.hasPointerCapture(e.pointerId)) return;

      var dx = e.clientX - iconDragState.startX;
      var dy = e.clientY - iconDragState.startY;

      // 5px threshold before starting drag (so clicks still work)
      if (!iconDragState.moved && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        iconDragState.moved = true;
        iconDragState.iconEl.style.zIndex = '10';
        iconDragState.iconEl.style.opacity = '0.7';
      }

      if (!iconDragState.moved) return;

      var z = getZoom();
      var x = (e.clientX - iconDragState.offsetX) / z;
      var y = (e.clientY - iconDragState.offsetY) / z;

      // Constrain to grid bounds
      x = Math.max(0, x);
      y = Math.max(0, y);

      if (!iconDragState.rafId) {
        iconDragState.rafId = requestAnimationFrame(function() {
          iconDragState.rafId = null;
          if (iconDragState.iconEl) {
            iconDragState.iconEl.style.left = x + 'px';
            iconDragState.iconEl.style.top = y + 'px';
          }
        });
      }
    });

    elIconGrid.addEventListener('pointerup', function(e) {
      if (!iconDragState.active) return;

      if (iconDragState.rafId) {
        cancelAnimationFrame(iconDragState.rafId);
        iconDragState.rafId = null;
      }

      if (iconDragState.iconEl) {
        iconDragState.iconEl.style.zIndex = '';
        iconDragState.iconEl.style.opacity = '';
        iconDragState.iconEl.releasePointerCapture(e.pointerId);
      }

      if (iconDragState.moved) {
        saveIconPositions();
        // Suppress the click that would follow
        dragState.suppressClick = true;
        iconDragState.iconEl = null;
        iconDragState.active = false;
        iconDragState.moved = false;
        return;
      }

      iconDragState.iconEl = null;
      iconDragState.active = false;
      iconDragState.moved = false;
    });
  }

  // --- Desktop Icon Events ---
  function handleIconClick(iconEl, windowId) {
    // U3: single-tap to open on touch (WCAG 2.5.1, no double-tap
    // dependency). Mouse path keeps the 300ms DBLCLICK_DELAY pattern
    // so first-click-selects / second-click-opens still works.
    if (isMobile()) {
      var linkUrlTouch = iconEl.getAttribute('data-url');
      if (linkUrlTouch) {
        window.open(linkUrlTouch, '_blank', 'noopener');
      } else {
        openWindow(windowId);
      }
      return;
    }

    var existing = clickTimeouts.get(windowId);
    if (existing) {
      // Second click — double-click
      clearTimeout(existing);
      clickTimeouts.delete(windowId);

      // Check if this is an external link project
      var linkUrl = iconEl.getAttribute('data-url');
      if (linkUrl) {
        window.open(linkUrl, '_blank', 'noopener');
      } else {
        openWindow(windowId);
      }
    } else {
      // First click — wait for potential double-click
      var timeout = setTimeout(function() {
        clickTimeouts.delete(windowId);
        selectIcon(iconEl);
      }, DBLCLICK_DELAY);
      clickTimeouts.set(windowId, timeout);
    }
  }

  function selectIcon(iconEl) {
    // Deselect all
    var icons = elIconGrid.querySelectorAll('.desktop-icon');
    icons.forEach(function(ic) { ic.setAttribute('data-selected', 'false'); });
    iconEl.setAttribute('data-selected', 'true');
  }

  // --- Event Delegation ---
  function setupEventDelegation() {
    // Desktop clicks (icons and windows)
    elDesktop.addEventListener('click', function(e) {
      // Icon click
      var icon = e.target.closest('.desktop-icon');
      if (icon) {
        var windowId = icon.getAttribute('data-window-id');
        if (windowId) handleIconClick(icon, windowId);
        return;
      }

      // Explicit close buttons (data-close-window)
      var explicitClose = e.target.closest('[data-close-window]');
      if (explicitClose) {
        closeWindow(explicitClose.getAttribute('data-close-window'));
        return;
      }

      // Window controls
      var closeBtn = e.target.closest('[aria-label="Close"]');
      if (closeBtn) {
        var winEl = closeBtn.closest('.window');
        if (winEl) closeWindow(winEl.id);
        return;
      }

      var minBtn = e.target.closest('[aria-label="Minimize"]');
      if (minBtn) {
        var winEl2 = minBtn.closest('.window');
        if (winEl2) minimizeWindow(winEl2.id);
        return;
      }

      var maxBtn = e.target.closest('[aria-label="Maximize"]');
      if (maxBtn) {
        var winEl3 = maxBtn.closest('.window');
        if (winEl3) toggleMaximize(winEl3.id);
        return;
      }

      // Click on window — bring to front
      var winClicked = e.target.closest('.window');
      if (winClicked && windows.has(winClicked.id)) {
        bringToFront(winClicked.id);
      }
    });

    // Title bar drag + window resize (pointer events on desktop)
    elDesktop.addEventListener('pointerdown', function(e) {
      // Check for resize first (edge/corner of a window)
      var winEl = e.target.closest('.window');
      if (winEl && windows.has(winEl.id)) {
        var edge = getResizeEdge(e, winEl);
        if (edge && !e.target.closest('.title-bar') && !e.target.closest('.window-body') && !e.target.closest('.status-bar')) {
          onResizeStart(e, winEl.id, edge);
          return;
        }
      }

      // Title bar drag
      var titleBar = e.target.closest('.title-bar');
      if (!titleBar) return;
      if (e.target.closest('button')) return;

      if (winEl && windows.has(winEl.id)) {
        onDragStart(e, winEl.id);
      }
    });

    elDesktop.addEventListener('pointermove', function(e) {
      // Handle active resize
      if (resizeState.active) {
        onResizeMove(e);
        return;
      }
      // Handle active drag
      if (dragState.windowId) {
        onDragMove(e);
        return;
      }
      // Cursor hint: show resize cursor when near window edge
      var winEl = e.target.closest('.window');
      if (winEl && windows.has(winEl.id)) {
        var win = windows.get(winEl.id);
        if (win.state !== 'maximized') {
          var edge = getResizeEdge(e, winEl);
          if (edge) {
            winEl.style.cursor = EDGE_CURSORS[edge];
            return;
          }
        }
        winEl.style.cursor = '';
      }
    });

    elDesktop.addEventListener('pointerup', function(e) {
      if (resizeState.active) {
        onResizeEnd(e);
        return;
      }
      onDragEnd(e);
    });

    // Taskbar clicks
    elTaskbar.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-window-id]');
      if (!btn) return;

      var id = btn.getAttribute('data-window-id');
      var win = windows.get(id);
      if (!win) return;

      if (win.state === 'minimized') {
        restoreWindow(id);
      } else if (win.state === 'open' || win.state === 'maximized') {
        if (activeWindowId === id) {
          minimizeWindow(id);
        } else {
          bringToFront(id);
          win.el.focus();
        }
      }
    });

    // Start menu item clicks
    elStartMenu.addEventListener('click', function(e) {
      var item = e.target.closest('[data-window], [data-action], [data-app]');
      if (!item) return;

      // Don't close menu if clicking a has-submenu parent
      if (item.closest('.has-submenu') && item.getAttribute('aria-haspopup')) return;

      var windowId = item.getAttribute('data-window');
      var action = item.getAttribute('data-action');
      var app = item.getAttribute('data-app');

      if (windowId) {
        openWindow(windowId);
      } else if (action === 'shutdown') {
        openWindow('window-shutdown');
      } else if (app) {
        var launcher = getAppLaunchers()[app];
        if (launcher) launcher();
      }

      elStartMenu.classList.remove('open');
      elStartButton.setAttribute('aria-expanded', 'false');
      closeAllSubmenus();
    });

    // Quick launch clicks
    document.getElementById('quick-launch').addEventListener('click', function(e) {
      var btn = e.target.closest('[data-window], [data-action]');
      if (!btn) return;
      var windowId = btn.getAttribute('data-window');
      var action = btn.getAttribute('data-action');
      if (windowId) openWindow(windowId);
      else if (action === 'show-desktop') showDesktop();
    });

    // Shutdown OK button
    var shutdownOk = document.getElementById('shutdown-ok');
    if (shutdownOk) shutdownOk.addEventListener('click', handleShutdown);

    // Global click for start menu
    document.addEventListener('click', handleGlobalClick);

    // Keyboard
    document.addEventListener('keydown', function(e) {
      // Escape closes start menu first (including any open submenus), then topmost window.
      if (e.key === 'Escape') {
        if (elStartMenu.classList.contains('open')) {
          elStartMenu.classList.remove('open');
          elStartButton.setAttribute('aria-expanded', 'false');
          closeAllSubmenus();
          elStartButton.focus();
          return;
        }
        if (activeWindowId) {
          closeWindow(activeWindowId);
          return;
        }
      }

      // Enter on focused icon opens it
      if (e.key === 'Enter') {
        var icon = document.activeElement;
        if (icon && icon.classList.contains('desktop-icon')) {
          var wid = icon.getAttribute('data-window-id');
          if (wid) openWindow(wid);
          e.preventDefault();
          return;
        }
      }

      // Space on focused icon selects it
      if (e.key === ' ') {
        var icon2 = document.activeElement;
        if (icon2 && icon2.classList.contains('desktop-icon')) {
          selectIcon(icon2);
          e.preventDefault();
          return;
        }
      }

      // Ctrl+F6 to switch windows
      if (e.key === 'F6' && e.ctrlKey) {
        e.preventDefault();
        var openIds = [];
        windows.forEach(function(w, id) {
          if (w.state === 'open' || w.state === 'maximized') openIds.push(id);
        });
        if (openIds.length < 2) return;

        var idx = openIds.indexOf(activeWindowId);
        var dir = e.shiftKey ? -1 : 1;
        var next = (idx + dir + openIds.length) % openIds.length;
        bringToFront(openIds[next]);
        var nextWin = windows.get(openIds[next]);
        if (nextWin && nextWin.el) nextWin.el.focus();
        announce(getTitleText(nextWin.el) + ' activated');
      }
    });

    // Start menu keyboard navigation
    elStartMenu.addEventListener('keydown', function(e) {
      var items = Array.from(elStartMenu.querySelectorAll('[role="menuitem"]'));
      var currentIdx = items.indexOf(document.activeElement);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        var next = currentIdx < items.length - 1 ? currentIdx + 1 : 0;
        items[next].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        var prev = currentIdx > 0 ? currentIdx - 1 : items.length - 1;
        items[prev].focus();
      } else if (e.key === 'ArrowRight') {
        var parentLi = document.activeElement.closest('.has-submenu');
        if (parentLi) {
          e.preventDefault();
          openSubmenu(parentLi);
          var sub = parentLi.querySelector('.start-submenu');
          if (sub) {
            var firstItem = sub.querySelector('[role="menuitem"]');
            if (firstItem) firstItem.focus();
          }
        }
      } else if (e.key === 'ArrowLeft') {
        var submenu = document.activeElement.closest('.start-submenu');
        if (submenu) {
          var parentItem = submenu.closest('.has-submenu');
          if (parentItem) {
            e.preventDefault();
            closeSubmenu(parentItem);
            var trigger = parentItem.querySelector(':scope > [role="menuitem"]');
            if (trigger) trigger.focus();
          }
        }
      } else if (e.key === 'Home') {
        e.preventDefault();
        items[0].focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        items[items.length - 1].focus();
      }
    });

    // Arrow key navigation for icon grid
    elIconGrid.addEventListener('keydown', function(e) {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;

      var icons = Array.from(elIconGrid.querySelectorAll('.desktop-icon'));
      var currentIdx = icons.indexOf(document.activeElement);
      if (currentIdx === -1) return;

      var cols = getIconColumns();
      var nextIdx = currentIdx;

      switch (e.key) {
        case 'ArrowDown':
          nextIdx = Math.min(currentIdx + 1, icons.length - 1);
          break;
        case 'ArrowUp':
          nextIdx = Math.max(currentIdx - 1, 0);
          break;
        case 'ArrowRight':
          nextIdx = Math.min(currentIdx + cols, icons.length - 1);
          break;
        case 'ArrowLeft':
          nextIdx = Math.max(currentIdx - cols, 0);
          break;
        case 'Home':
          nextIdx = e.ctrlKey ? 0 : currentIdx - (currentIdx % cols);
          break;
        case 'End':
          nextIdx = e.ctrlKey ? icons.length - 1 : Math.min(currentIdx - (currentIdx % cols) + cols - 1, icons.length - 1);
          break;
      }

      e.preventDefault();
      icons[currentIdx].setAttribute('tabindex', '-1');
      icons[nextIdx].setAttribute('tabindex', '0');
      icons[nextIdx].focus();
    });
  }

  // --- Helpers ---
  function getWindowRect(el) {
    return {
      x: parseInt(el.style.left) || 0,
      y: parseInt(el.style.top) || 0,
      w: parseInt(el.style.width) || 500,
      h: parseInt(el.style.height) || 400
    };
  }

  function getTitleText(el) {
    var t = el.querySelector('.title-bar-text');
    return t ? t.textContent : '';
  }

  function isMobile() {
    return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  }

  function getIconColumns() {
    var gridHeight = elIconGrid.clientHeight;
    return Math.max(1, Math.floor(gridHeight / 80));
  }

  // --- Generate Desktop Icons + Project Windows ---
  function generateProjects() {
    var template = document.getElementById('project-window-template');
    var startMenuProjects = document.getElementById('start-menu-projects');

    // System icons FIRST (My Computer, Recycle Bin, About Me, etc.)
    var systemIcons = [
      { id: 'window-my-computer', title: 'My Computer', icon: 'img/icons/mycomputer.png' },
      { id: 'window-recycle-bin', title: 'Recycle Bin', icon: 'img/icons/recyclebin.png' },
      { id: 'window-about', title: 'About Me', icon: 'img/icons/notepad.png' },
      { id: 'window-guestbook', title: 'Guestbook', icon: 'img/icons/guestbook.png' },
      { id: 'window-contact', title: 'E-Mail', icon: 'img/icons/contact.png' }
    ];

    systemIcons.forEach(function(sys, i) {
      var icon = document.createElement('div');
      icon.className = 'desktop-icon';
      icon.setAttribute('role', 'gridcell');
      icon.setAttribute('tabindex', i === 0 ? '0' : '-1');
      icon.setAttribute('data-window-id', sys.id);
      icon.setAttribute('data-selected', 'false');
      icon.setAttribute('aria-label', 'Open ' + sys.title);

      var img = document.createElement('img');
      img.src = sys.icon;
      img.alt = '';
      img.setAttribute('aria-hidden', 'true');
      img.width = 48;
      img.height = 48;
      icon.appendChild(img);

      var label = document.createElement('span');
      label.className = 'desktop-icon-label';
      label.textContent = sys.title;
      icon.appendChild(label);

      elIconGrid.appendChild(icon);
    });

    // Then project icons
    PROJECTS.forEach(function(project, i) {
      var id = 'window-' + project.id;

      if (project.type === 'construction') {
        // Create an "Under Construction" window
        var conWin = document.createElement('div');
        conWin.id = id;
        conWin.className = 'window';
        conWin.setAttribute('data-state', 'closed');
        conWin.setAttribute('role', 'dialog');
        conWin.setAttribute('tabindex', '-1');
        conWin.style.width = '350px';
        conWin.innerHTML =
          '<div class="title-bar">' +
            '<div class="title-bar-text">Under Construction - Coming Soon</div>' +
            '<div class="title-bar-controls" role="toolbar" aria-label="Window controls">' +
              '<button aria-label="Minimize"></button>' +
              '<button aria-label="Maximize"></button>' +
              '<button aria-label="Close"></button>' +
            '</div>' +
          '</div>' +
          '<div class="window-body" role="document" style="text-align:center;padding:16px;">' +
            '<p style="font-family:\'Pixelated MS Sans Serif\',Arial;font-size:11px;margin-bottom:12px;">' + project.title + ' is coming soon!</p>' +
            '<img src="img/under-construction.gif" alt="Under Construction" style="max-width:100px;margin:0 auto;display:block;image-rendering:pixelated;">' +
          '</div>';
        elDesktop.appendChild(conWin);
        registerWindow(id, conWin);
      } else if (project.type === 'cavaro') {
        var cavaroWin = document.createElement('div');
        cavaroWin.id = id;
        cavaroWin.className = 'window';
        cavaroWin.setAttribute('data-state', 'closed');
        cavaroWin.setAttribute('role', 'dialog');
        cavaroWin.setAttribute('tabindex', '-1');
        cavaroWin.style.width = '450px';
        cavaroWin.innerHTML =
          '<div class="title-bar">' +
            '<div class="title-bar-text">cavaro.txt - Notepad</div>' +
            '<div class="title-bar-controls" role="toolbar" aria-label="Window controls">' +
              '<button aria-label="Minimize"></button>' +
              '<button aria-label="Maximize"></button>' +
              '<button aria-label="Close"></button>' +
            '</div>' +
          '</div>' +
          '<div class="notepad-menu-bar" aria-hidden="true">' +
            '<span>File</span><span>Edit</span><span>Format</span><span>Help</span>' +
          '</div>' +
          '<div class="window-body" role="document">' +
            '<div class="notepad-content" style="min-height:250px;">Isn\'t it ironic that there\'s no real "Relationship" in CRM? Everything is transactional. Hardly anything has changed with customer relationship and lifecycle technology, and frankly the big players and new agentic startups are just doing the same legacy thing, now faster.\n\nThis transactional thinking is stuck in the 1990s.\n\nWe are in stealth mode developing the foundational tech to fix this problem (and take the fight to the big guys). BTW, this isn\'t an LLM wrapper - LLMs will ultimately wrap Cavaro.\n\nAre you experienced with causal inference at scale? Are you a marketing lifecycle expert? Are you a full stack SWE who\'s got the battle scars to prove it? Are you sick and tired of wallpapering over major industry issues driven by vendors hard-selling you on a new tool every week? If you\'re any of those (or just curious), I\'d love to talk.\n\nEmail me to learn more using the E-Mail icon or at mitch@ribar.ai\n\nThis message will self-destruct in 3 seconds...</div>' +
          '</div>' +
          '<div class="status-bar"><p class="status-bar-field">Ln 1, Col 1</p></div>';
        elDesktop.appendChild(cavaroWin);
        registerWindow(id, cavaroWin);
      } else if (project.type === 'link') {
        // External link — no window, just open URL on double-click
        // We'll handle this in the icon click handler
      } else {
        // Standard project window from template
        var clone = template.content.cloneNode(true);
        var winEl = clone.querySelector('.window');
        winEl.id = id;
        winEl.setAttribute('aria-labelledby', 'title-' + project.id);
        var titleText = clone.querySelector('.title-bar-text');
        titleText.id = 'title-' + project.id;
        titleText.textContent = project.title;
        var desc = clone.querySelector('.project-description');
        desc.textContent = project.description;
        var techStack = clone.querySelector('.tech-stack');
        project.tech.forEach(function(t) {
          var pill = document.createElement('span');
          pill.className = 'tech-pill';
          pill.textContent = t;
          techStack.appendChild(pill);
        });
        var links = clone.querySelector('.project-links');
        if (project.url) {
          var a = document.createElement('a');
          a.href = project.url;
          a.target = '_blank';
          a.rel = 'noopener';
          a.textContent = 'Visit';
          links.appendChild(a);
        }

        var screenshot = clone.querySelector('.project-screenshot');
        if (project.screenshot) {
          screenshot.src = project.screenshot;
          screenshot.alt = project.title + ' screenshot';
          screenshot.width = 640;
          screenshot.height = 400;
        } else {
          screenshot.remove();
        }

        var statusField = clone.querySelector('.status-bar-field');
        statusField.textContent = 'Last updated: ' + project.updated;

        elDesktop.appendChild(clone);
        registerWindow(id, document.getElementById(id));
      }

      // Create desktop icon (for ALL project types)
      var icon = document.createElement('div');
      icon.className = 'desktop-icon';
      icon.setAttribute('role', 'gridcell');
      icon.setAttribute('tabindex', '-1');
      icon.setAttribute('data-window-id', id);
      icon.setAttribute('data-selected', 'false');
      icon.setAttribute('aria-label', 'Open ' + project.title);

      // For link-type projects, store the URL on the icon for direct opening
      if (project.type === 'link' && project.url) {
        icon.setAttribute('data-url', project.url);
      }

      var img = document.createElement('img');
      img.src = project.icon || 'img/icons/project-default.png';
      img.alt = '';
      img.setAttribute('aria-hidden', 'true');
      img.width = 48;
      img.height = 48;
      icon.appendChild(img);

      var label = document.createElement('span');
      label.className = 'desktop-icon-label';
      label.textContent = project.title;
      icon.appendChild(label);

      elIconGrid.appendChild(icon);

      // Hide Cavaro icon if dismissed within 48h
      if (project.type === 'cavaro') {
        var dismissed = parseInt(localStorage.getItem('cavaro-dismissed')) || 0;
        var hoursSince = (Date.now() - dismissed) / (1000 * 60 * 60);
        if (dismissed > 0 && hoursSince < 48) {
          icon.style.display = 'none';
        }
      }
    });

  }

  // --- Register System Windows ---
  function registerSystemWindows() {
    SYSTEM_WINDOWS.forEach(function(name) {
      var id = 'window-' + name;
      var el = document.getElementById(id);
      if (el) registerWindow(id, el);
    });
  }

  // --- System Properties Tab Switching ---
  function initMyComputer() {
    var tablist = document.querySelector('#window-my-computer menu[role="tablist"]');
    if (!tablist) return;
    var tabs = tablist.querySelectorAll('[role="tab"]');
    tabs.forEach(function(tab) {
      tab.setAttribute('tabindex', tab.getAttribute('aria-selected') === 'true' ? '0' : '-1');
      tab.addEventListener('click', function() {
        tabs.forEach(function(t) { t.setAttribute('aria-selected', 'false'); t.setAttribute('tabindex', '-1'); });
        tab.setAttribute('aria-selected', 'true');
        tab.setAttribute('tabindex', '0');
        var panels = document.querySelectorAll('#window-my-computer .sysprop-panel');
        panels.forEach(function(p) { p.style.display = 'none'; });
        var target = document.getElementById(tab.getAttribute('aria-controls'));
        if (target) target.style.display = 'block';
      });
    });

    tablist.addEventListener('keydown', function(e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      var tabArr = Array.from(tabs);
      var idx = tabArr.indexOf(document.activeElement);
      if (idx === -1) return;
      e.preventDefault();
      if (e.key === 'ArrowRight') {
        idx = idx < tabArr.length - 1 ? idx + 1 : 0;
      } else {
        idx = idx > 0 ? idx - 1 : tabArr.length - 1;
      }
      tabArr[idx].click();
      tabArr[idx].focus();
    });
  }

  // --- Contact Form ---
  function initContactForm() {
    var form = document.getElementById('contact-form');
    if (form) {
      form.addEventListener('submit', function(e) {
        e.preventDefault();

        // Run HTML5 validation (required fields, email format)
        if (!form.checkValidity()) {
          form.reportValidity();
          return;
        }

        var sendBtn = form.querySelector('button[type="submit"]');
        if (sendBtn) {
          sendBtn.textContent = 'Sending...';
          sendBtn.disabled = true;
        }

        // Build JSON body — Formspree recommends JSON for AJAX
        var data = {
          email: form.querySelector('[name="email"]').value,
          _subject: form.querySelector('[name="_subject"]').value,
          message: form.querySelector('[name="message"]').value
        };

        fetch(form.action, {
          method: 'POST',
          body: JSON.stringify(data),
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        }).then(function(response) {
          if (response.ok) {
            if (sendBtn) sendBtn.textContent = 'Message Sent!';
            setTimeout(function() {
              closeWindow('window-contact');
              form.reset();
              if (sendBtn) { sendBtn.textContent = 'Send'; sendBtn.disabled = false; }
            }, 1500);
          } else {
            response.json().then(function(body) {
              var msg = (body.errors && body.errors.length) ? body.errors[0].message : 'Send Failed';
              if (sendBtn) { sendBtn.textContent = msg; sendBtn.disabled = false; }
            }).catch(function() {
              if (sendBtn) { sendBtn.textContent = 'Send Failed - Try Again'; sendBtn.disabled = false; }
            });
          }
        }).catch(function() {
          if (sendBtn) { sendBtn.textContent = 'Send Failed - Try Again'; sendBtn.disabled = false; }
        });
      });
    }
  }

  // --- Context Menus ---
  var elCtxDesktop, elCtxTitlebar, elCtxTaskbar;
  var ctxTargetWindowId = null;

  function getZoom() {
    var z = parseFloat(getComputedStyle(document.body).zoom);
    return isNaN(z) ? 1 : z;
  }

  function showContextMenu(menuEl, x, y) {
    hideAllContextMenus();
    // Divide by zoom factor since CSS position uses unzoomed coordinates
    var z = getZoom();
    menuEl.style.left = (x / z) + 'px';
    menuEl.style.top = (y / z) + 'px';
    menuEl.classList.add('open');
    var firstItem = menuEl.querySelector('[role="menuitem"]');
    if (firstItem) firstItem.focus();
  }

  function hideAllContextMenus() {
    if (elCtxDesktop) elCtxDesktop.classList.remove('open');
    if (elCtxTitlebar) elCtxTitlebar.classList.remove('open');
    if (elCtxTaskbar) elCtxTaskbar.classList.remove('open');
    // Note: do NOT reset ctxTargetWindowId here. showContextMenu calls hideAllContextMenus
    // before opening the new menu, which would clobber the id the contextmenu handler
    // just assigned. The id is short-lived per right-click and gets overwritten on the next
    // contextmenu event; leaving a stale value between events is harmless because the
    // action handlers only fire when a [data-action] menu item is clicked.
  }

  function setupContextMenus() {
    elCtxDesktop = document.getElementById('context-menu-desktop');
    elCtxTitlebar = document.getElementById('context-menu-titlebar');
    elCtxTaskbar = document.getElementById('context-menu-taskbar');

    // Right-click on desktop
    elDesktop.addEventListener('contextmenu', function(e) {
      e.preventDefault();
      // Title bar right-click
      var titleBar = e.target.closest('.title-bar');
      if (titleBar) {
        var winEl = titleBar.closest('.window');
        if (winEl && windows.has(winEl.id)) {
          ctxTargetWindowId = winEl.id;
          showContextMenu(elCtxTitlebar, e.clientX, e.clientY);
        }
        return;
      }
      // Desktop right-click (not on a window)
      if (!e.target.closest('.window')) {
        showContextMenu(elCtxDesktop, e.clientX, e.clientY);
      }
    });

    // Right-click on taskbar
    document.getElementById('taskbar').addEventListener('contextmenu', function(e) {
      e.preventDefault();
      if (!e.target.closest('#start-button') && !e.target.closest('#start-menu')) {
        if (elCtxTaskbar) showContextMenu(elCtxTaskbar, e.clientX, e.clientY);
      }
    });

    // Single document-click delegator: capture the target window id BEFORE hiding
    // menus (hideAllContextMenus nulls ctxTargetWindowId), then dispatch the action,
    // then always hide menus. Two separate listeners would race — the hide listener
    // would null the id before the action listener could read it.
    document.addEventListener('click', function(e) {
      var action = e.target.closest('[data-action]');
      var targetId = ctxTargetWindowId;
      if (action) {
        var act = action.getAttribute('data-action');
        switch (act) {
          case 'refresh': location.reload(); break;
          case 'properties': openWindow('window-my-computer'); break;
          case 'arrange-icons':
            localStorage.removeItem('icon-positions');
            layoutIcons();
            break;
          case 'ctx-minimize':
            if (targetId) minimizeWindow(targetId);
            break;
          case 'ctx-maximize':
            if (targetId) toggleMaximize(targetId);
            break;
          case 'ctx-close':
            if (targetId) closeWindow(targetId);
            break;
          case 'cascade-windows':
            var idx = 0;
            windows.forEach(function(win, id) {
              if (win.state === 'open' || win.state === 'maximized') {
                var offset = 30 + (idx * 22);
                win.el.style.top = offset + 'px';
                win.el.style.left = offset + 'px';
                bringToFront(id);
                idx++;
              }
            });
            break;
          case 'show-desktop':
            showDesktop();
            break;
        }
      }
      hideAllContextMenus();
    });

    // Keyboard in context menus
    [elCtxDesktop, elCtxTitlebar, elCtxTaskbar].forEach(function(menu) {
      if (!menu) return;
      menu.addEventListener('keydown', function(e) {
        var items = Array.from(menu.querySelectorAll('[role="menuitem"]'));
        var idx = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); items[(idx + 1) % items.length].focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); items[(idx - 1 + items.length) % items.length].focus(); }
        else if (e.key === 'Escape') { hideAllContextMenus(); }
      });
    });
  }

  // --- Selection Rectangle ---
  var selectionState = { active: false, startX: 0, startY: 0, rafId: null };
  var elSelectionRect;

  function setupSelectionRect() {
    elSelectionRect = document.getElementById('selection-rect');
    if (!elSelectionRect) return;

    elDesktop.addEventListener('pointerdown', function(e) {
      // Only start selection on empty desktop space (not on icons, windows, taskbar)
      if (e.target !== elDesktop && e.target !== elIconGrid) return;
      if (e.button !== 0) return;

      var rect = elDesktop.getBoundingClientRect();
      selectionState.active = true;
      selectionState.startX = e.clientX - rect.left;
      selectionState.startY = e.clientY - rect.top;

      elSelectionRect.style.left = selectionState.startX + 'px';
      elSelectionRect.style.top = selectionState.startY + 'px';
      elSelectionRect.style.width = '0';
      elSelectionRect.style.height = '0';
      elSelectionRect.style.display = 'block';
    });

    elDesktop.addEventListener('pointermove', function(e) {
      if (!selectionState.active) return;
      // Don't interfere with window drag
      if (dragState.windowId) { selectionState.active = false; elSelectionRect.style.display = 'none'; return; }

      var rect = elDesktop.getBoundingClientRect();
      var curX = e.clientX - rect.left;
      var curY = e.clientY - rect.top;

      var x = Math.min(selectionState.startX, curX);
      var y = Math.min(selectionState.startY, curY);
      var w = Math.abs(curX - selectionState.startX);
      var h = Math.abs(curY - selectionState.startY);

      elSelectionRect.style.left = x + 'px';
      elSelectionRect.style.top = y + 'px';
      elSelectionRect.style.width = w + 'px';
      elSelectionRect.style.height = h + 'px';
    });

    elDesktop.addEventListener('pointerup', function(e) {
      if (!selectionState.active) return;
      selectionState.active = false;

      // Check which icons intersect the selection rect
      var selRect = elSelectionRect.getBoundingClientRect();
      if (selRect.width > 5 || selRect.height > 5) {
        var icons = elIconGrid.querySelectorAll('.desktop-icon');
        icons.forEach(function(ic) {
          ic.setAttribute('data-selected', 'false');
        });
        icons.forEach(function(ic) {
          var icRect = ic.getBoundingClientRect();
          if (icRect.right > selRect.left && icRect.left < selRect.right &&
              icRect.bottom > selRect.top && icRect.top < selRect.bottom) {
            ic.setAttribute('data-selected', 'true');
          }
        });
      }

      elSelectionRect.style.display = 'none';
    });
  }

  // --- Cascading Submenus ---
  var submenuTimeout = null;

  function openSubmenu(li) {
    var parent = li.parentElement;
    if (parent) {
      parent.querySelectorAll(':scope > .has-submenu.submenu-open').forEach(function(sib) {
        if (sib !== li) closeSubmenu(sib);
      });
    }
    li.classList.add('submenu-open');
    var trigger = li.querySelector(':scope > [aria-haspopup]');
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
  }

  function closeSubmenu(li) {
    li.classList.remove('submenu-open');
    var trigger = li.querySelector(':scope > [aria-haspopup]');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    li.querySelectorAll('.submenu-open').forEach(function(nested) {
      nested.classList.remove('submenu-open');
      var t = nested.querySelector(':scope > [aria-haspopup]');
      if (t) t.setAttribute('aria-expanded', 'false');
    });
  }

  function closeAllSubmenus() {
    document.querySelectorAll('.has-submenu.submenu-open').forEach(function(li) {
      closeSubmenu(li);
    });
  }

  function initSubmenus() {
    document.querySelectorAll('.has-submenu').forEach(function(li) {
      li.addEventListener('mouseenter', function() {
        clearTimeout(submenuTimeout);
        var target = li;
        submenuTimeout = setTimeout(function() { openSubmenu(target); }, 350);
      });
      li.addEventListener('mouseleave', function() {
        clearTimeout(submenuTimeout);
        var target = li;
        submenuTimeout = setTimeout(function() { closeSubmenu(target); }, 200);
      });

      // U3: tap-to-toggle on touch (mouse path unchanged). The parent
      // <button class="start-menu-item"> carries aria-haspopup, so we
      // intercept its click and stop propagation to keep the start-menu
      // delegator (which closes the menu on any click) from firing.
      // openSubmenu/closeSubmenu already toggle aria-expanded.
      var trigger = li.querySelector(':scope > [aria-haspopup]');
      if (trigger) {
        trigger.addEventListener('click', function(e) {
          if (!isMobile()) return;
          e.preventDefault();
          e.stopPropagation();
          if (li.classList.contains('submenu-open')) {
            closeSubmenu(li);
          } else {
            openSubmenu(li);
          }
        });
      }
    });

    // U3: outside-tap closes any open submenus on touch. Scoped to
    // taps that land outside #start-menu entirely — taps INSIDE the
    // menu that don't hit a .has-submenu trigger (e.g., a leaf item)
    // are handled by the existing start-menu delegator which calls
    // closeAllSubmenus before closing the start menu.
    document.addEventListener('click', function(e) {
      if (!isMobile()) return;
      if (!e.target.closest('#start-menu') && !e.target.closest('#start-button')) {
        closeAllSubmenus();
      }
    });
  }

  // --- Shut Down ---
  function handleShutdown() {
    var option = document.querySelector('input[name="shutdown-option"]:checked');
    if (!option) return;

    closeWindow('window-shutdown');
    elStartMenu.classList.remove('open');
    elStartButton.setAttribute('aria-expanded', 'false');

    if (option.id === 'sd-shutdown') {
      // Show "safe to turn off" screen
      var overlay = document.createElement('div');
      overlay.id = 'shutdown-overlay';
      overlay.innerHTML = '<div>It\'s now safe to turn off<br>your computer.</div>';
      document.body.appendChild(overlay);
      setTimeout(function() {
        sessionStorage.removeItem('booted');
        location.reload();
      }, 3000);
    } else if (option.id === 'sd-restart' || option.id === 'sd-dos') {
      sessionStorage.removeItem('booted');
      localStorage.removeItem('cavaro-dismissed');
      location.reload();
    }
  }

  // --- Quick Launch: Show Desktop ---
  function showDesktop() {
    windows.forEach(function(win, id) {
      if (win.state === 'open' || win.state === 'maximized') {
        minimizeWindow(id);
      }
    });
  }

  // --- Embedded App Launchers ---

  function createAppWindow(id, title, bodyHtml, opts) {
    opts = opts || {};
    var existing = document.getElementById(id);
    if (existing) {
      openWindow(id);
      return;
    }

    var win = document.createElement('div');
    win.id = id;
    win.className = 'window';
    win.setAttribute('data-state', 'closed');
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-labelledby', 'title-' + id.replace('window-', ''));
    win.setAttribute('tabindex', '-1');
    if (opts.width) win.style.width = opts.width;
    if (opts.height) win.style.height = opts.height;
    if (opts.noResize) win.setAttribute('data-no-resize', 'true');

    var controls = opts.noResize
      ? '<button aria-label="Close"></button>'
      : '<button aria-label="Minimize"></button><button aria-label="Maximize"></button><button aria-label="Close"></button>';

    var bodyStyle = opts.bodyStyle ? ' style="' + opts.bodyStyle + '"' : '';

    win.innerHTML =
      '<div class="title-bar">' +
        '<img src="img/icons/project-sm.png" class="title-bar-icon" alt="" aria-hidden="true">' +
        '<div class="title-bar-text" id="title-' + id.replace('window-', '') + '">' + title + '</div>' +
        '<div class="title-bar-controls" role="toolbar" aria-label="Window controls">' +
          controls +
        '</div>' +
      '</div>' +
      '<div class="window-body" role="document"' + bodyStyle + '>' + bodyHtml + '</div>';

    elDesktop.appendChild(win);
    registerWindow(id, win, { transient: !!opts.transient });
    openWindow(id);
  }

  function launchPaint() {
    // jspaint.app expects 800+ px and is unusable on phones. On phone-sized
    // touch devices, skip iframe creation entirely (avoids focus traps and
    // memory artifacts) and render a Win98-styled "best on desktop" note.
    // Tablets keep the iframe — they have the room jspaint needs.
    var isPhoneTouch = window.matchMedia('(hover: none) and (pointer: coarse) and (max-width: 767px)').matches;
    var paintBody = isPhoneTouch
      ? '<div class="paint-mobile-note">' +
          '<img src="img/icons/paint-sm.png" alt="" class="paint-mobile-note-icon">' +
          '<p>Paint runs best on a desktop with a mouse — open this site on a larger screen for the full experience.</p>' +
        '</div>'
      : '<iframe src="https://jspaint.app" style="width:100%;height:100%;border:none;flex:1;"></iframe>';
    createAppWindow('window-paint', 'untitled - Paint', paintBody,
      { width: '640px', height: '480px', bodyStyle: 'display:flex;flex-direction:column;padding:0;overflow:hidden;' });
  }

  function launchMinesweeper() {
    var msHtml =
      '<div id="ms-app">' +
        '<div id="header">' +
          '<div class="counter" id="mine-count">010</div>' +
          '<button id="face">&#128578;</button>' +
          '<div class="counter" id="timer">000</div>' +
        '</div>' +
        '<div id="grid"></div>' +
        '<div id="msg"></div>' +
      '</div>';

    createAppWindow('window-minesweeper', 'Minesweeper', msHtml,
      { width: '250px', noResize: true, bodyStyle: 'padding:4px;margin:0;background:#c0c0c0;' });

    var script = document.createElement('script');
    script.src = 'apps/minesweeper/game.js';
    document.getElementById('ms-app').appendChild(script);
  }

  // Lazy-load apps/help/book.js on first launch. The file is ~63KB of static
  // page content and most visitors never open Help — paying that cost on every
  // cold load is wasteful. Concurrent launches share one load via the promise.
  var bookLoadPromise = null;
  function ensureBookLoaded() {
    if (window.BOOK_PAGES) return Promise.resolve();
    if (bookLoadPromise) return bookLoadPromise;
    bookLoadPromise = new Promise(function(resolve, reject) {
      var s = document.createElement('script');
      s.src = 'apps/help/book.js';
      s.onload = function() { resolve(); };
      s.onerror = function() { bookLoadPromise = null; reject(new Error('book.js failed to load')); };
      document.head.appendChild(s);
    });
    return bookLoadPromise;
  }

  function launchHelpBook() {
    ensureBookLoaded().then(renderHelpBook).catch(function() {
      // Soft failure: open the window with a placeholder so the user sees something.
      renderHelpBook(['<p style="padding:20px;color:#800000;">Help content failed to load. Please check your connection and try again.</p>']);
    });
  }

  function renderHelpBook(overridePages) {
    var page = 0;
    var pages = overridePages || window.BOOK_PAGES || [];
    var total = pages.length;

    function navHtml() {
      return '<div style="display:flex;align-items:center;justify-content:space-between;' +
        'padding:6px 12px;border-top:1px solid #808080;background:var(--win98-silver);' +
        'font-family:\'Pixelated MS Sans Serif\',Arial;font-size:11px;">' +
        '<button id="help-prev" style="min-width:70px;"' + (page === 0 ? ' disabled' : '') +
          '>\u25C0 Previous</button>' +
        '<span>Page ' + (page + 1) + ' of ' + total + '</span>' +
        '<button id="help-next" style="min-width:70px;"' + (page === total - 1 ? ' disabled' : '') +
          '>Next \u25B6</button>' +
        '</div>';
    }

    // render() owns both the DOM and the event bindings, called once on initial
    // setup and again on every Prev/Next click. Previously the initial bindings
    // also lived in a post-createAppWindow block, which made the binding logic
    // live in two places — easy to drift on a future tweak.
    function render() {
      var win = document.getElementById('window-help-book');
      if (!win) return;
      var body = win.querySelector('.window-body');
      body.innerHTML =
        '<div id="help-page" style="flex:1;overflow-y:auto;padding:20px 24px;' +
          'font-family:Georgia,\'Times New Roman\',serif;font-size:12px;' +
          'background:#fff;text-align:center;">' +
          pages[page] +
        '</div>' +
        navHtml();

      var prev = body.querySelector('#help-prev');
      var next = body.querySelector('#help-next');
      if (prev) prev.addEventListener('click', function() { if (page > 0) { page--; render(); } });
      if (next) next.addEventListener('click', function() { if (page < total - 1) { page++; render(); } });
    }

    createAppWindow('window-help-book', 'The Way of Code - Help', '', {
      width: '400px',
      height: '600px',
      bodyStyle: 'display:flex;flex-direction:column;padding:0;overflow:hidden;'
    });
    render();
  }

  function launchCalculator() {
    var calcHtml =
      '<div id="calc-app">' +
        '<div id="calc">' +
          '<div id="display-mem"></div>' +
          '<div id="display">0</div>' +
          '<div class="row">' +
            '<button id="mc">MC</button><button id="mr">MR</button>' +
            '<button id="ms">MS</button><button id="mp">M+</button>' +
          '</div>' +
          '<div class="row">' +
            '<button data-v="7">7</button><button data-v="8">8</button>' +
            '<button data-v="9">9</button><button class="op" data-op="/">/</button>' +
            '<button class="op" id="sqrt">sqrt</button>' +
          '</div>' +
          '<div class="row">' +
            '<button data-v="4">4</button><button data-v="5">5</button>' +
            '<button data-v="6">6</button><button class="op" data-op="*">*</button>' +
            '<button class="op" id="pct">%</button>' +
          '</div>' +
          '<div class="row">' +
            '<button data-v="1">1</button><button data-v="2">2</button>' +
            '<button data-v="3">3</button><button class="op" data-op="-">-</button>' +
            '<button class="op" id="inv">1/x</button>' +
          '</div>' +
          '<div class="row">' +
            '<button data-v="0" class="wide">0</button><button data-v=".">.</button>' +
            '<button class="op" data-op="+">+</button><button class="op" id="eq">=</button>' +
          '</div>' +
          '<div class="row">' +
            '<button id="back">Bksp</button><button id="ce">CE</button><button id="clr">C</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    createAppWindow('window-calculator', 'Calculator', calcHtml,
      { width: '240px', noResize: true, bodyStyle: 'padding:4px;margin:0;background:#c0c0c0;' });

    var script = document.createElement('script');
    script.src = 'apps/calculator/calc.js';
    document.getElementById('calc-app').appendChild(script);
  }

  function launchNotepad() {
    var id = 'window-notepad-' + Date.now();
    createAppWindow(id, 'Untitled - Notepad',
      '<div class="notepad-menu-bar" aria-hidden="true"><span>File</span><span>Edit</span><span>Format</span><span>Help</span></div>' +
      '<textarea style="width:100%;flex:1;border:none;padding:4px;font-family:\'Lucida Console\',\'Courier New\',monospace;font-size:12px;resize:none;box-sizing:border-box;" placeholder=""></textarea>',
      { width: '400px', height: '300px', bodyStyle: 'display:flex;flex-direction:column;padding:0;', transient: true });
  }

  function launchRun() {
    var runId = 'window-run-dialog';
    var existing = document.getElementById(runId);
    if (existing) { openWindow(runId); return; }

    var bodyHtml =
      '<div style="font-family:\'Pixelated MS Sans Serif\',Arial;font-size:11px;margin-bottom:8px;">' +
        'Type the name of a program, folder, document, or Internet resource, and Windows will open it for you.' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">' +
        '<label style="font-family:\'Pixelated MS Sans Serif\',Arial;font-size:11px;font-weight:bold;">Open:</label>' +
        '<input type="text" value="cmd" readonly style="flex:1;font-size:11px;background:#fff;">' +
      '</div>' +
      '<div style="text-align:right;">' +
        '<button class="run-ok-btn" style="min-width:75px;">OK</button>' +
        '<button data-close-window="' + runId + '" style="min-width:75px;margin-left:4px;">Cancel</button>' +
        '<button style="min-width:75px;margin-left:4px;" disabled>Browse...</button>' +
      '</div>';

    createAppWindow(runId, 'Run', bodyHtml,
      { width: '320px', noResize: true, bodyStyle: 'padding:12px;background:#c0c0c0;' });

    var win = document.getElementById(runId);
    win.querySelector('.run-ok-btn').addEventListener('click', function() {
      closeWindow(runId);
      launchMatrixTerminal();
    });
  }

  function launchNapster() {
    var tabNames = ['Search', 'Library', 'Transfer'];
    var tabsHtml = '<menu role="tablist" class="napster-tabs">';
    tabNames.forEach(function(name, idx) {
      tabsHtml += '<li role="tab" aria-selected="' + (idx === 0 ? 'true' : 'false') +
        '" aria-controls="napster-panel-' + name.toLowerCase() + '">' + name + '</li>';
    });
    tabsHtml += '</menu>';

    var searchPanel =
      '<div role="tabpanel" id="napster-panel-search" class="napster-panel" style="display:flex;">' +
        '<div class="napster-search-bar">' +
          '<label for="napster-search-input">Search:</label>' +
          '<input type="text" id="napster-search-input" value="Artist" placeholder="Enter artist or song name">' +
          '<button id="napster-find-btn">Find It!</button>' +
        '</div>' +
        '<div class="napster-results-wrap">' +
          '<table class="napster-results">' +
            '<thead><tr>' +
              '<th>Song</th><th>Artist</th><th>Size</th><th>Bitrate</th><th>User</th><th>Connection</th>' +
            '</tr></thead>' +
            '<tbody id="napster-results-body">' +
              buildNapsterSearchResults() +
            '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>';

    var libraryPanel =
      '<div role="tabpanel" id="napster-panel-library" class="napster-panel" style="display:none;">' +
        '<div class="napster-library-empty">Your shared folder is empty</div>' +
      '</div>';

    var transferPanel =
      '<div role="tabpanel" id="napster-panel-transfer" class="napster-panel" style="display:none;">' +
        '<div class="napster-transfer-list">' +
          buildNapsterTransfers() +
        '</div>' +
      '</div>';

    var bodyHtml =
      tabsHtml +
      '<div class="napster-panel-area">' +
        searchPanel + libraryPanel + transferPanel +
      '</div>' +
      '<div class="status-bar napster-status"><p class="status-bar-field">8,342 users sharing 1,247,382 files</p></div>';

    createAppWindow('window-napster', 'Napster v2.0 BETA 7', bodyHtml,
      { width: '520px', height: '420px', bodyStyle: 'padding:4px;background:var(--win98-silver);display:flex;flex-direction:column;overflow:hidden;' });

    // Wire tab switching
    var napWin = document.getElementById('window-napster');
    if (!napWin) return;
    var tabs = napWin.querySelectorAll('.napster-tabs [role="tab"]');
    var panels = napWin.querySelectorAll('[role="tabpanel"]');
    tabs.forEach(function(tab) {
      tab.addEventListener('click', function() {
        tabs.forEach(function(t) { t.setAttribute('aria-selected', 'false'); });
        panels.forEach(function(p) { p.style.display = 'none'; });
        tab.setAttribute('aria-selected', 'true');
        var panelId = tab.getAttribute('aria-controls');
        var panel = document.getElementById(panelId);
        if (panel) panel.style.display = 'flex';
      });
    });

    // Wire row double-click to open URL
    var tbody = document.getElementById('napster-results-body');
    if (tbody) {
      tbody.addEventListener('dblclick', function(e) {
        var row = e.target.closest('.napster-row');
        if (row && row.dataset.url) {
          window.open(row.dataset.url, '_blank', 'noopener');
        }
      });
      // Single click selects
      tbody.addEventListener('click', function(e) {
        var row = e.target.closest('.napster-row');
        if (!row) return;
        var prev = tbody.querySelector('[data-selected="true"]');
        if (prev) prev.removeAttribute('data-selected');
        row.setAttribute('data-selected', 'true');
      });
    }
  }

  function launchMatrixTerminal() {
    createAppWindow('window-matrix', 'C:\\WINDOWS\\system32\\cmd.exe',
      '<div id="matrix-terminal" style="background:#000;color:#00FF00;font-family:\'Perfect DOS VGA 437\',\'Lucida Console\',monospace;font-size:14px;padding:8px;height:100%;position:relative;overflow:hidden;">' +
        '<div id="matrix-text"></div>' +
        '<canvas id="matrix-canvas" style="position:absolute;top:0;left:0;width:100%;height:100%;display:none;"></canvas>' +
      '</div>',
      { width: '500px', height: '400px', bodyStyle: 'padding:0;overflow:hidden;' });

    var textEl = document.getElementById('matrix-text');
    var canvasEl = document.getElementById('matrix-canvas');

    if (!textEl) return;

    var CURSOR = '<span style="animation:dos-cursor-blink 1s step-end infinite;">_</span>';

    function typeText(text, callback) {
      textEl.innerHTML = '';
      var i = 0;
      var interval = setInterval(function() {
        if (i < text.length) {
          textEl.innerHTML = text.substring(0, i + 1) + CURSOR;
          i++;
        } else {
          clearInterval(interval);
          textEl.innerHTML = text + CURSOR;
          if (callback) callback();
        }
      }, 120);
    }

    // Phase 1: type "..." then hold 3 seconds
    typeText('...', function() {
      setTimeout(function() {
        // Phase 2: type "Knock, knock, Neo." then hold 3 seconds
        typeText('Knock, knock, Neo.', function() {
          setTimeout(function() {
            // Phase 3: type "..." then hold 4 seconds
            typeText('...', function() {
              setTimeout(function() {
                // Phase 4: Matrix rain
                textEl.style.display = 'none';
                canvasEl.style.display = 'block';
                if (window.startMatrixRain) {
                  window.startMatrixRain(canvasEl);
                }
              }, 4000);
            });
          }, 3000);
        });
      }, 3000);
    });
  }

  function launchICQ() {
    var icqFlowerSvg =
      '<svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">' +
        '<g transform="translate(20,20)">' +
          '<ellipse cx="0" cy="-10" rx="5" ry="10" fill="#49B749" stroke="#000" stroke-width="1" />' +
          '<ellipse cx="0" cy="-10" rx="5" ry="10" fill="#49B749" stroke="#000" stroke-width="1" transform="rotate(45)" />' +
          '<ellipse cx="0" cy="-10" rx="5" ry="10" fill="#49B749" stroke="#000" stroke-width="1" transform="rotate(90)" />' +
          '<ellipse cx="0" cy="-10" rx="5" ry="10" fill="#CC0000" stroke="#000" stroke-width="1" transform="rotate(135)" />' +
          '<ellipse cx="0" cy="-10" rx="5" ry="10" fill="#49B749" stroke="#000" stroke-width="1" transform="rotate(180)" />' +
          '<ellipse cx="0" cy="-10" rx="5" ry="10" fill="#49B749" stroke="#000" stroke-width="1" transform="rotate(225)" />' +
          '<ellipse cx="0" cy="-10" rx="5" ry="10" fill="#49B749" stroke="#000" stroke-width="1" transform="rotate(270)" />' +
          '<ellipse cx="0" cy="-10" rx="5" ry="10" fill="#49B749" stroke="#000" stroke-width="1" transform="rotate(315)" />' +
          '<circle cx="0" cy="0" r="5" fill="#FFD700" stroke="#000" stroke-width="1" />' +
        '</g>' +
      '</svg>';

    var icqHtml =
      '<div class="icq-panel">' +
        '<div class="icq-header">' +
          '<div class="icq-flower-logo">' + icqFlowerSvg + '</div>' +
          '<div class="icq-user-name">Mitch</div>' +
          '<div class="icq-uin">UIN: 12345678</div>' +
          '<div class="icq-status-dropdown"><span class="icq-status-dot"></span> Online</div>' +
        '</div>' +
        '<div class="icq-contacts">' +
          '<div class="icq-section-header">Online (3)</div>' +
          '<div class="icq-contact"><span class="icq-contact-icon online"></span><span class="icq-contact-name">CoolDude99</span></div>' +
          '<div class="icq-contact"><span class="icq-contact-icon online"></span><span class="icq-contact-name">~*SuRfErGrL*~</span></div>' +
          '<div class="icq-contact"><span class="icq-contact-icon online"></span><span class="icq-contact-name">hackerman_2600</span></div>' +
          '<div class="icq-section-header">Offline (2)</div>' +
          '<div class="icq-contact"><span class="icq-contact-icon offline"></span><span class="icq-contact-name">FutureBoy2000</span></div>' +
          '<div class="icq-contact"><span class="icq-contact-icon offline"></span><span class="icq-contact-name">xX_WebMaster_Xx</span></div>' +
        '</div>' +
        '<div class="icq-toolbar">' +
          '<button title="Add Contact">+</button>' +
          '<button title="Menu">\u2261</button>' +
          '<button title="Settings">\u2699</button>' +
          '<button title="Help">?</button>' +
        '</div>' +
      '</div>';

    createAppWindow('window-icq', 'ICQ', icqHtml, {
      width: '170px',
      height: '400px',
      noResize: true,
      bodyStyle: 'padding:0;overflow:hidden;display:flex;flex-direction:column;'
    });

    // Position toward the right side of the desktop
    var win = document.getElementById('window-icq');
    if (win) {
      win.style.left = Math.max(0, window.innerWidth - 220) + 'px';
      win.style.top = '40px';
    }
  }

  // --- Init ---
  function init() {
    // Cache DOM references
    elDesktop = document.getElementById('desktop');
    elIconGrid = document.getElementById('icon-grid');
    elTaskbar = document.getElementById('taskbar');
    elTaskbarButtons = document.getElementById('taskbar-buttons');
    elStartMenu = document.getElementById('start-menu');
    elStartButton = document.getElementById('start-button');
    elClock = document.getElementById('clock');
    elVisitorCounter = document.getElementById('visitor-counter');
    elAnnouncer = document.getElementById('window-announcer');

    // Register system windows first
    registerSystemWindows();

    // Generate projects from data
    generateProjects();

    // Setup all event listeners
    setupEventDelegation();

    // Start system tray
    startClock();
    initVisitorCounter();
    initContactForm();
    initMyComputer();
    setupSystemTrayClicks();
    setupContextMenus();
    setupSelectionRect();
    initSubmenus();
    layoutIcons();
    setupIconDrag();

    // Apply hash on load
    applyHashState();
  }

  document.addEventListener('DOMContentLoaded', init);

})();
