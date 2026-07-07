// Contract: window.__initMinesweeper() is called after every launch. On
// the first call it wires the persistent #grid/#face listeners and starts
// a game; on later calls it just starts a new game. The DOM survives close
// (createAppWindow re-opens the same element), so handlers stay bound.
(function() {
  var W = 9, H = 9, MINES = 10;
  var wired = false;
  var grid, mines, revealed, flagged, gameOver, firstClick, timerVal, timerInt;
  var elGrid, elFace, elMines, elTimer, elMsg;

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

  function reveal(i) {
    if (revealed.has(i) || flagged.has(i) || gameOver) return;
    revealed.add(i);
    var c = elGrid.children[i]; c.classList.add("revealed");
    if (grid[i] === -1) {
      c.textContent = "💣"; c.classList.add("mine-hit");
      endGame(false); return;
    }
    if (grid[i] > 0) { c.textContent = grid[i]; c.classList.add("c" + grid[i]); }
    else neighbors(i).forEach(function(nb) { reveal(nb); });
    if (revealed.size === W * H - MINES) endGame(true);
  }

  function endGame(won) {
    gameOver = true; clearInterval(timerInt);
    elFace.innerHTML = won ? "&#128526;" : "&#128565;";
    elMsg.textContent = won ? "You Win!" : "Game Over";
    if (!won) mines.forEach(function(m) {
      if (!revealed.has(m)) { elGrid.children[m].textContent = "💣"; elGrid.children[m].classList.add("revealed"); }
    });
  }

  function updateMineCount() {
    var v = MINES - flagged.size;
    elMines.textContent = (v < 0 ? "-" : "") + ("00" + Math.abs(v)).slice(-3);
  }

  function newGame() {
    grid = []; mines = new Set(); revealed = new Set(); flagged = new Set();
    gameOver = false; firstClick = true; timerVal = 0;
    clearInterval(timerInt); elTimer.textContent = "000";
    elFace.innerHTML = "&#128578;"; elMsg.textContent = "";
    elGrid.innerHTML = "";
    for (var i = 0; i < W * H; i++) {
      grid[i] = 0;
      var c = document.createElement("div"); c.className = "cell"; c.dataset.i = i;
      elGrid.appendChild(c);
    }
    updateMineCount();
  }

  window.__initMinesweeper = function() {
    elGrid = document.getElementById("grid");
    elFace = document.getElementById("face");
    elMines = document.getElementById("mine-count");
    elTimer = document.getElementById("timer");
    elMsg = document.getElementById("msg");
    if (!elGrid || !elFace) return;

    // Wire once per page lifetime — the DOM persists across close/reopen
    // (the launcher's createAppWindow reuses the same window element), so
    // re-wiring on every launch would stack click handlers and one tap
    // would fire reveal() N times.
    if (!wired) {
      elGrid.addEventListener("click", function(e) {
        var c = e.target.closest(".cell"); if (!c || gameOver) return;
        var i = +c.dataset.i;
        if (flagged.has(i)) return;
        if (firstClick) {
          firstClick = false; placeMines(i);
          timerInt = setInterval(function() {
            timerVal++; if (timerVal > 999) timerVal = 999;
            elTimer.textContent = ("00" + timerVal).slice(-3);
          }, 1000);
        }
        reveal(i);
      });
      elGrid.addEventListener("contextmenu", function(e) {
        e.preventDefault();
        var c = e.target.closest(".cell"); if (!c || gameOver) return;
        var i = +c.dataset.i;
        if (revealed.has(i)) return;
        if (flagged.has(i)) { flagged.delete(i); c.textContent = ""; }
        else { flagged.add(i); c.textContent = "🚩"; }
        updateMineCount();
      });
      elFace.addEventListener("click", newGame);
      wired = true;
    }

    newGame();
  };
})();
