// Contract: window.__initCalculator() runs after every launch. The first
// call wires #calc click + global keydown to the persistent calculator
// DOM (createAppWindow reuses the same window element across close/reopen).
// Subsequent calls just reset display state.
(function() {
  var wired = false;
  var calcEl, disp, memDisp;
  var cur, prev, op, fresh, mem;

  // Whole numbers get Win98's trailing point from CSS (#display.no-point),
  // so the text itself stays the plain number.
  function show(v) {
    disp.textContent = v;
    disp.classList.toggle("no-point", /^-?\d+$/.test(v));
  }

  // Round away binary noise (0.1 + 0.2 shows 0.3, as Win98's decimal
  // arithmetic did).
  function fmt(n) { return String(parseFloat(n.toPrecision(15))); }

  // Win98 wording. The error stays on screen; the next key starts fresh.
  function showError(msg) {
    cur = "0"; prev = null; op = null; fresh = true;
    disp.textContent = msg;
    disp.classList.remove("no-point");
  }

  function calc() {
    var a = prev, b = parseFloat(cur);
    if (op === "/" && b === 0) { showError("Cannot divide by zero."); return; }
    var r = op === "+" ? a + b : op === "-" ? a - b : op === "*" ? a * b : a / b;
    cur = fmt(r);
    prev = parseFloat(cur); fresh = true; show(cur);
  }

  function reset() {
    cur = "0"; prev = null; op = null; fresh = true; mem = 0;
    if (memDisp) memDisp.textContent = "";
    show("0");
  }

  function onCalcClick(e) {
    var b = e.target.closest("button"); if (!b) return;
    var v = b.dataset.v, o = b.dataset.op, id = b.id;
    if (v !== undefined) {
      if (fresh) { cur = v === "." ? "0." : v; fresh = false; }
      else { if (v === "." && cur.indexOf(".") >= 0) return; cur += v; }
      show(cur);
    } else if (o) {
      if (prev !== null && op && !fresh) calc();
      prev = parseFloat(cur); op = o; fresh = true;
    } else if (id === "eq") {
      if (prev !== null && op) calc();
      op = null;
    } else if (id === "clr") {
      cur = "0"; prev = null; op = null; fresh = true; show("0");
    } else if (id === "ce") {
      cur = "0"; fresh = true; show("0");
    } else if (id === "back") {
      cur = cur.length > 1 ? cur.slice(0, -1) : "0";
      if (cur === "-") cur = "0";
      show(cur);
    } else if (id === "sqrt") {
      var sq = parseFloat(cur);
      if (sq < 0) { showError("Invalid input for function."); return; }
      cur = fmt(Math.sqrt(sq)); fresh = true; show(cur);
    } else if (id === "pct") {
      if (prev !== null) cur = fmt(prev * parseFloat(cur) / 100);
      fresh = true; show(cur);
    } else if (id === "inv") {
      var n = parseFloat(cur);
      if (!n) { showError("Cannot divide by zero."); return; }
      cur = fmt(1 / n); fresh = true; show(cur);
    } else if (id === "neg") {
      if (cur !== "0") cur = cur.charAt(0) === "-" ? cur.slice(1) : "-" + cur;
      show(cur);
    } else if (id === "mc") { mem = 0; memDisp.textContent = ""; }
    else if (id === "mr") { cur = fmt(mem); fresh = true; show(cur); }
    else if (id === "ms") { mem = parseFloat(cur); memDisp.textContent = "M"; }
    else if (id === "mp") { mem += parseFloat(cur); memDisp.textContent = "M"; }
  }

  function onKeydown(e) {
    // Only act when the calculator window is open and holds the keyboard
    // focus. Being merely open used to swallow digits, operators, Enter and
    // Backspace typed into Notepad or the e-mail form.
    var win = document.getElementById("window-calculator");
    if (!win) return;
    var state = win.getAttribute("data-state");
    if (state !== "open" && state !== "maximized") return;
    if (!win.contains(document.activeElement)) return;

    var key = e.key;
    var btn = null;
    if (/^[0-9]$/.test(key)) {
      btn = calcEl.querySelector('[data-v="' + key + '"]');
    } else if (key === "+" || key === "-" || key === "*" || key === "/") {
      btn = calcEl.querySelector('[data-op="' + key + '"]');
    } else if (key === "Enter" || key === "=") {
      btn = document.getElementById("eq");
    } else if (key === "Escape") {
      btn = document.getElementById("clr");
    } else if (key === "Delete") {
      btn = document.getElementById("ce");
    } else if (key === "Backspace") {
      btn = document.getElementById("back");
    } else if (key === "." || key === ",") {
      btn = calcEl.querySelector('[data-v="."]');
    } else if (key === "F9") {
      btn = document.getElementById("neg");
    } else if (key === "@") {
      btn = document.getElementById("sqrt");
    } else if (key === "%") {
      btn = document.getElementById("pct");
    } else if (key === "r" || key === "R") {
      btn = document.getElementById("inv");
    }
    if (btn) { e.preventDefault(); btn.click(); }
  }

  window.__initCalculator = function() {
    calcEl = document.getElementById("calc");
    disp = document.getElementById("display");
    memDisp = document.getElementById("display-mem");
    if (!calcEl || !disp) return;

    if (!wired) {
      calcEl.addEventListener("click", onCalcClick);
      // One global keydown handler for the page lifetime; gated on window
      // state so it's a no-op when the calculator isn't visible. Previously
      // each launch added another handler, so N opens meant one keystroke
      // fired N button clicks.
      document.addEventListener("keydown", onKeydown);
      wired = true;
    }
    reset();
  };
})();
