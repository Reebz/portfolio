// Contract: window.__initMinesweeper() is called after every launch. On
// the first call it wires the persistent listeners and starts a game; on
// later calls it just starts a new game. The DOM survives close
// (createAppWindow re-opens the same element), so handlers stay bound.
(function() {
  // Win98's three skill levels. The chosen level survives relaunches.
  var LEVELS = {
    beginner:     { w: 9,  h: 9,  mines: 10 },
    intermediate: { w: 16, h: 16, mines: 40 },
    expert:       { w: 30, h: 16, mines: 99 }
  };
  var level = 'beginner';
  var W = 9, H = 9, MINES = 10;
  var wired = false;
  var grid, mines, revealed, flagged, marked, gameOver, firstClick, timerVal, timerInt;
  var elWin, elApp, elGrid, elFace, elMines, elTimer, elMsg, elMenuBtn, elMenu;
  // Left button held on the board: the cell under it shows pressed and the
  // face gasps until release, which opens the cell under the pointer.
  var pressing = false, pressedCell = null;
  // Touch has no right button: holding a finger on a cell flags it.
  var touchHold = null, touchFlagged = false, touchFlagAt = 0;

  // LED counter: three 13x23 seven-segment digits, unlit segments faintly red.
  var SEGS = {
    a: '2,1 11,1 9,3 4,3',
    b: '12,2 12,11 10,9 10,4',
    c: '12,12 12,21 10,19 10,14',
    d: '2,22 4,20 9,20 11,22',
    e: '1,12 3,14 3,19 1,21',
    f: '1,2 3,4 3,9 1,11',
    g: '2,11 3,10 10,10 11,11 10,12 3,12'
  };
  var DIGITS = {
    '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg',
    '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g'
  };

  function led(el, n) {
    var s = n < 0 ? '-' + ('0' + Math.min(99, -n)).slice(-2) : ('00' + Math.min(999, n)).slice(-3);
    var svg = '';
    for (var d = 0; d < 3; d++) {
      var lit = DIGITS[s.charAt(d)];
      svg += '<g transform="translate(' + d * 13 + ' 0)">';
      for (var k in SEGS) {
        svg += '<polygon points="' + SEGS[k] + '" fill="' + (lit.indexOf(k) >= 0 ? '#ff0000' : '#3c0000') + '"/>';
      }
      svg += '</g>';
    }
    // The digits stay in the DOM as text for screen readers.
    el.innerHTML = '<span class="ms-sr">' + s + '</span>' +
      '<svg aria-hidden="true" width="39" height="23" viewBox="0 0 39 23" shape-rendering="crispEdges">' + svg + '</svg>';
  }

  function neighbors(i) {
    var r = Math.floor(i / W), c = i % W, result = [];
    for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      var nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < H && nc >= 0 && nc < W) result.push(nr * W + nc);
    }
    return result;
  }

  function placeMines(safe) {
    while (mines.size < MINES) {
      var r = Math.floor(Math.random() * W * H);
      if (r !== safe && !mines.has(r)) mines.add(r);
    }
    mines.forEach(function(m) { grid[m] = -1; });
    for (var i = 0; i < W * H; i++) {
      if (grid[i] === -1) continue;
      var n = 0; neighbors(i).forEach(function(nb) { if (grid[nb] === -1) n++; });
      grid[i] = n;
    }
  }

  function cellAt(i) { return elGrid.children[i]; }

  function setFace(name) { elFace.setAttribute('data-face', name); }

  function reveal(i) {
    if (revealed.has(i) || flagged.has(i) || gameOver) return;
    revealed.add(i);
    marked.delete(i);
    var c = cellAt(i);
    c.className = 'cell revealed';
    c.textContent = '';
    if (grid[i] === -1) {
      c.textContent = '💣'; c.classList.add('mine', 'mine-hit');
      endGame(false); return;
    }
    if (grid[i] > 0) { c.textContent = grid[i]; c.classList.add('c' + grid[i]); }
    else neighbors(i).forEach(function(nb) { reveal(nb); });
    if (!gameOver && revealed.size === W * H - MINES) endGame(true);
  }

  // First left click starts the clock at 1, as Win98 did; the first cell
  // opened is never a mine.
  function openCell(i) {
    if (firstClick) {
      firstClick = false; placeMines(i);
      timerVal = 1; led(elTimer, timerVal);
      timerInt = setInterval(function() {
        if (timerVal < 999) { timerVal++; led(elTimer, timerVal); }
      }, 1000);
    }
    reveal(i);
  }

  // Clicking an opened number whose flags are all placed opens the rest of
  // its neighbours (Win98's two-button "chord").
  function chord(i) {
    if (!revealed.has(i) || grid[i] <= 0) return;
    var nb = neighbors(i), f = 0;
    nb.forEach(function(n) { if (flagged.has(n)) f++; });
    if (f === grid[i]) nb.forEach(function(n) { reveal(n); });
  }

  // Right click cycles blank, flag, question mark (Win98's Marks option).
  function cycleMark(c) {
    var i = +c.dataset.i;
    if (gameOver || revealed.has(i)) return;
    if (flagged.has(i)) { flagged.delete(i); marked.add(i); c.className = 'cell marked'; c.textContent = '?'; }
    else if (marked.has(i)) { marked.delete(i); c.className = 'cell'; c.textContent = ''; }
    else { flagged.add(i); c.className = 'cell flagged'; c.textContent = '🚩'; }
    updateMineCount();
  }

  // A held finger toggles just the flag; the question mark is a mouse nicety.
  function toggleFlag(c) {
    var i = +c.dataset.i;
    if (gameOver || revealed.has(i)) return;
    marked.delete(i);
    if (flagged.has(i)) { flagged.delete(i); c.className = 'cell'; c.textContent = ''; }
    else { flagged.add(i); c.className = 'cell flagged'; c.textContent = '🚩'; }
    updateMineCount();
  }

  function endGame(won) {
    gameOver = true; clearInterval(timerInt);
    setFace(won ? 'cool' : 'dead');
    elMsg.textContent = won ? 'You win!' : 'Game over';
    // A win flags every mine; a loss shows the mines that were missed and
    // crosses out the flags that were wrong.
    mines.forEach(function(m) {
      var c = cellAt(m);
      if (won) {
        if (!flagged.has(m)) { flagged.add(m); c.className = 'cell flagged'; c.textContent = '🚩'; }
      } else if (!revealed.has(m) && !flagged.has(m)) {
        c.className = 'cell revealed mine'; c.textContent = '💣';
      }
    });
    if (!won) flagged.forEach(function(f) {
      if (!mines.has(f)) { var c = cellAt(f); c.className = 'cell revealed mine-wrong'; c.textContent = '❌'; }
    });
    updateMineCount();
  }

  function updateMineCount() { led(elMines, MINES - flagged.size); }

  function newGame() {
    grid = []; mines = new Set(); revealed = new Set(); flagged = new Set(); marked = new Set();
    gameOver = false; firstClick = true; timerVal = 0;
    clearInterval(timerInt); led(elTimer, 0);
    setFace('smile'); elMsg.textContent = '';
    elGrid.style.setProperty('--ms-cols', W);
    elGrid.style.setProperty('--ms-rows', H);
    var html = '';
    for (var i = 0; i < W * H; i++) { grid[i] = 0; html += '<div class="cell" data-i="' + i + '"></div>'; }
    elGrid.innerHTML = html;
    updateMineCount();
  }

  function zoom() { return parseFloat(getComputedStyle(document.body).zoom) || 1; }
  function isTouch() { return window.matchMedia('(hover: none) and (pointer: coarse)').matches; }
  // Room across the screen for the board, after the window frame and bevels.
  function boardRoom() { return window.innerWidth / zoom() - 60; }

  // Desktop keeps Win98's 16px cells. Touch gets up to 24px for fingers,
  // shrinking for a wide board, never under 16.
  function fitCells() {
    var size = isTouch() ? Math.max(16, Math.min(24, Math.floor(boardRoom() / W))) : 16;
    elApp.style.setProperty('--ms-cell', size + 'px');
  }

  // The window wraps the board: measure its natural width, then pin it in px
  // (the window manager saves and restores px rects), and keep it on screen.
  function fitWindow() {
    if (!elWin || elWin.getAttribute('data-state') !== 'open') return;
    elWin.style.width = 'auto';
    elWin.style.width = getComputedStyle(elWin).width;
    var z = zoom();
    var r = elWin.getBoundingClientRect();
    var over = r.right - window.innerWidth;
    if (over > 0) elWin.style.left = Math.max(0, (r.left - over) / z) + 'px';
    var bar = document.getElementById('taskbar');
    var bottom = bar ? bar.getBoundingClientRect().top : window.innerHeight;
    var overY = r.bottom - bottom;
    if (overY > 0) elWin.style.top = Math.max(0, (r.top - overY) / z) + 'px';
  }

  function setLevel(name) {
    level = name;
    W = LEVELS[name].w; H = LEVELS[name].h; MINES = LEVELS[name].mines;
    fitCells();
    newGame();
    fitWindow();
  }

  // --- Game menu ---
  function menuItems() {
    return Array.prototype.slice.call(elMenu.querySelectorAll('button:not(:disabled)'));
  }

  function openMenu(focusFirst) {
    // A level too wide for this screen even at 16px cells is greyed out.
    Array.prototype.forEach.call(elMenu.querySelectorAll('[data-ms]'), function(b) {
      var L = LEVELS[b.getAttribute('data-ms')];
      if (!L) return;
      b.setAttribute('aria-checked', String(b.getAttribute('data-ms') === level));
      b.disabled = boardRoom() / L.w < 16;
    });
    elMenu.hidden = false;
    elMenuBtn.setAttribute('aria-expanded', 'true');
    if (focusFirst) menuItems()[0].focus();
  }

  function closeMenu() {
    if (elMenu.hidden) return;
    elMenu.hidden = true;
    elMenuBtn.setAttribute('aria-expanded', 'false');
  }

  function runMenu(act) {
    closeMenu();
    if (act === 'new') newGame();
    else if (act === 'exit') {
      var close = elWin && elWin.querySelector('.title-bar-controls [aria-label="Close"]');
      if (close) close.click();
    } else if (LEVELS[act]) setLevel(act);
  }

  // --- Board input ---
  function cellFrom(e) {
    var c = e.target && e.target.closest ? e.target.closest('.cell') : null;
    return c && elGrid.contains(c) ? c : null;
  }

  function press(c) {
    if (c && (c.classList.contains('revealed') || c.classList.contains('flagged'))) c = null;
    if (c === pressedCell) return;
    if (pressedCell) pressedCell.classList.remove('pressed');
    pressedCell = c;
    if (c) c.classList.add('pressed');
  }

  function cancelTouchHold() {
    if (touchHold) { clearTimeout(touchHold.timer); touchHold = null; }
  }

  function endPress() {
    pressing = false;
    press(null);
    cancelTouchHold();
    if (!gameOver) setFace('smile');
  }

  function wire() {
    elGrid.addEventListener('pointerdown', function(e) {
      if (gameOver || e.button !== 0) return;
      var c = cellFrom(e);
      if (!c) return;
      pressing = true;
      touchFlagged = false;
      setFace('oh');
      press(c);
      if (e.pointerType === 'touch') {
        var x = e.clientX, y = e.clientY;
        cancelTouchHold();
        touchHold = { x: x, y: y, timer: setTimeout(function() {
          touchHold = null;
          touchFlagged = true;
          touchFlagAt = Date.now();
          press(null);
          setFace('smile');
          toggleFlag(c);
        }, 400) };
      }
    });

    elGrid.addEventListener('pointermove', function(e) {
      if (!pressing) return;
      if (touchHold && (Math.abs(e.clientX - touchHold.x) > 8 || Math.abs(e.clientY - touchHold.y) > 8)) {
        cancelTouchHold();
      }
      if (e.pointerType !== 'touch') press(cellFrom(e));
    });

    elGrid.addEventListener('pointerleave', function(e) {
      if (pressing && e.pointerType !== 'touch') press(null);
    });

    elGrid.addEventListener('pointercancel', function() { if (pressing) endPress(); });

    // Release anywhere ends the press; over a cell it opens that cell.
    document.addEventListener('pointerup', function(e) {
      if (!pressing) return;
      var flaggedByHold = touchFlagged;
      endPress();
      touchFlagged = false;
      if (gameOver || flaggedByHold || e.button !== 0) return;
      var c = cellFrom(e);
      if (!c) return;
      var i = +c.dataset.i;
      if (revealed.has(i)) chord(i);
      else if (!flagged.has(i)) openCell(i);
    });

    elGrid.addEventListener('contextmenu', function(e) {
      e.preventDefault();
      // Android sends contextmenu for the same held finger that just flagged.
      if (Date.now() - touchFlagAt < 1000) return;
      var c = cellFrom(e);
      if (c) cycleMark(c);
    });

    elFace.addEventListener('click', newGame);

    elMenuBtn.addEventListener('click', function() {
      if (elMenu.hidden) openMenu(false); else closeMenu();
    });
    elMenuBtn.addEventListener('keydown', function(e) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMenu(true);
      }
    });
    elMenu.addEventListener('click', function(e) {
      var item = e.target.closest('button[data-ms]');
      if (item && !item.disabled) runMenu(item.getAttribute('data-ms'));
    });
    elMenu.addEventListener('mouseover', function(e) {
      var item = e.target.closest('button:not(:disabled)');
      if (item && item !== document.activeElement) item.focus({ preventScroll: true });
    });
    elMenu.addEventListener('keydown', function(e) {
      var items = menuItems();
      var at = items.indexOf(document.activeElement);
      if (e.key === 'Escape') {
        // Keep the desktop's Escape (close the active window) out of this.
        e.stopPropagation();
        closeMenu();
        elMenuBtn.focus();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        var step = e.key === 'ArrowDown' ? 1 : -1;
        items[(at + step + items.length) % items.length].focus();
      } else if (e.key.length === 1) {
        // The underlined letter picks its item.
        var hit = items.filter(function(b) {
          return (b.getAttribute('data-key') || '') === e.key.toLowerCase();
        })[0];
        if (hit) { e.preventDefault(); hit.click(); }
      }
    });
    // A press anywhere outside the menu closes it.
    document.addEventListener('pointerdown', function(e) {
      if (!elMenu.hidden && !elMenu.contains(e.target) && !elMenuBtn.contains(e.target)) closeMenu();
    }, true);

    // F2 starts a new game and Alt+G opens the Game menu, while the window
    // has focus.
    elWin.addEventListener('keydown', function(e) {
      if (e.key === 'F2') { e.preventDefault(); closeMenu(); newGame(); }
      else if (e.altKey && e.code === 'KeyG') { e.preventDefault(); openMenu(true); }
    });
  }

  window.__initMinesweeper = function() {
    elWin = document.getElementById('window-minesweeper');
    elApp = document.getElementById('ms-app');
    elGrid = document.getElementById('grid');
    elFace = document.getElementById('face');
    elMines = document.getElementById('mine-count');
    elTimer = document.getElementById('timer');
    elMsg = document.getElementById('msg');
    elMenuBtn = document.getElementById('ms-game-menu-btn');
    elMenu = document.getElementById('ms-game-menu');
    if (!elWin || !elGrid || !elFace || !elMenu) return;

    // Wire once per page lifetime — the DOM persists across close/reopen
    // (the launcher's createAppWindow reuses the same window element), so
    // re-wiring on every launch would stack handlers and one tap would
    // fire reveal() N times.
    if (!wired) {
      wire();
      wired = true;
    }

    closeMenu();
    fitCells();
    newGame();
    fitWindow();
  };
})();
