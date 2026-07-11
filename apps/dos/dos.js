/*
 * MS-DOS Prompt — a real command line hiding Mitch's actual portfolio content.
 * No build step, no deps. window.__initDos(winEl) wires an existing terminal
 * body (built by launchDos in desktop.js) and is idempotent per window.
 *
 * Design contract mirrors the other apps/: expose one window.__init<Name>,
 * guard against double-wiring, and never throw on relaunch.
 */
(function () {
  'use strict';

  // Virtual filesystem. Values are printed verbatim by `type`.
  var FILES = {
    'RESUME.TXT':
      'Mitch Ribar\r\n' +
      '===========\r\n' +
      'I make AI products, growth systems, software, and occasionally trouble.\r\n' +
      '\r\n' +
      'I build things that ship: AI product work, growth engineering, and\r\n' +
      'full-stack software. I also try to make things look good -- but not\r\n' +
      'perfect. Fun > perfection.\r\n' +
      '\r\n' +
      'Poke around the desktop -- every icon opens something real.\r\n' +
      'Type CONTACT.TXT to get in touch.',
    'CONTACT.TXT':
      'Contact\r\n' +
      '=======\r\n' +
      'E-mail : mitch@ribar.ai\r\n' +
      'Web    : https://reebz.com\r\n' +
      '\r\n' +
      'The E-Mail icon on the desktop works too -- it really sends.',
    'ABOUT.TXT':
      'Thanks for surfing to my corner of the web.\r\n' +
      'This whole site is a Windows 98 desktop, built from scratch in\r\n' +
      'vanilla HTML, CSS, and JavaScript. No frameworks. Shoutout to Geocities.',
    'PROJECTS.TXT':
      'Projects\r\n' +
      '========\r\n' +
      'The desktop icons are the portfolio. Double-click any of them.\r\n' +
      'There is more hidden around than you might expect. Try RUN, or the\r\n' +
      'Start menu. And yes -- CRASH is a real command in here.'
  };

  // Fake directory listing metadata (size only; dates are cosmetic).
  var FILE_ORDER = ['RESUME.TXT', 'CONTACT.TXT', 'ABOUT.TXT', 'PROJECTS.TXT'];

  var HELP =
    'Supported commands:\r\n' +
    '  DIR              List files in the current directory\r\n' +
    '  TYPE <file>      Print a file (e.g. TYPE RESUME.TXT)\r\n' +
    '  CLS              Clear the screen\r\n' +
    '  VER              Show the Windows version\r\n' +
    '  ECHO <text>      Print text\r\n' +
    '  HELP             This list\r\n' +
    '  EXIT             Close the prompt\r\n' +
    '  CRASH            ...do not run this command';

  var BANNER =
    'Microsoft(R) Windows 98\r\n' +
    '   (C)Copyright Microsoft Corp 1981-1999.\r\n' +
    '\r\n' +
    'Type HELP for a list of commands.\r\n';

  function pad(str, len) {
    str = String(str);
    while (str.length < len) str += ' ';
    return str;
  }
  function padLeft(str, len) {
    str = String(str);
    while (str.length < len) str = ' ' + str;
    return str;
  }

  function fileSize(name) {
    // Deterministic pseudo-size so DIR looks period-authentic.
    return (FILES[name] || '').length + 128;
  }

  function dirListing() {
    var out = ' Volume in drive C is PORTFOLIO\r\n';
    out += ' Directory of C:\\\r\n\r\n';
    var total = 0;
    FILE_ORDER.forEach(function (name) {
      var dot = name.indexOf('.');
      var base = pad(name.slice(0, dot), 8);
      var ext = name.slice(dot + 1);
      var size = fileSize(name);
      total += size;
      out += base + ' ' + pad(ext, 3) + '   ' + padLeft(size.toLocaleString(), 9) +
        '  07-11-99   9:00a\r\n';
    });
    out += '        ' + FILE_ORDER.length + ' file(s)  ' +
      padLeft(total.toLocaleString(), 12) + ' bytes\r\n';
    out += '        0 dir(s)   33,554,432 bytes free';
    return out;
  }

  function initDos(winEl) {
    if (!winEl) winEl = document;
    var output = winEl.querySelector('#dos-output');
    var input = winEl.querySelector('#dos-input');
    var cwd = winEl.querySelector('#dos-cwd');
    if (!output || !input) return;
    if (input.dataset.dosWired === '1') { input.focus(); return; }
    input.dataset.dosWired = '1';

    var history = [];
    var historyIdx = -1;

    function print(text) {
      var line = document.createElement('div');
      line.className = 'dos-line';
      // Text only; never HTML — keeps user echo safe.
      line.textContent = text;
      output.appendChild(line);
      // Keep the newest output in view.
      var screen = output.parentElement;
      if (screen) screen.scrollTop = screen.scrollHeight;
    }

    function printBlock(block) {
      block.split('\r\n').forEach(print);
    }

    function prompt() {
      return (cwd ? cwd.textContent : 'C:\\>');
    }

    function run(raw) {
      var cmd = raw.trim();
      // Echo the command with the prompt, like a real terminal.
      print(prompt() + ' ' + cmd);
      if (!cmd) return;
      history.push(cmd);
      historyIdx = history.length;

      var parts = cmd.split(/\s+/);
      var verb = parts[0].toUpperCase();
      var arg = cmd.slice(parts[0].length).trim();

      switch (verb) {
        case 'DIR':
          printBlock(dirListing());
          break;
        case 'TYPE': {
          if (!arg) { print('Required parameter missing'); break; }
          var key = arg.toUpperCase();
          if (FILES[key]) printBlock(FILES[key]);
          else print('File not found - ' + arg.toUpperCase());
          break;
        }
        case 'CLS':
          output.innerHTML = '';
          break;
        case 'VER':
          print('');
          print('Windows 98 [Version 4.10.1998]');
          break;
        case 'ECHO':
          print(arg ? arg : 'ECHO is on.');
          break;
        case 'HELP':
          printBlock(HELP);
          break;
        case 'CD':
          if (arg) print('The system cannot find the path specified.');
          else print('C:\\');
          break;
        case 'EXIT':
          if (window.__closeDos) window.__closeDos();
          return;
        case 'CRASH':
        case 'BSOD':
          if (window.__showBsod) window.__showBsod();
          else print('...nothing happened. (BSOD unavailable)');
          return;
        case 'WIN':
          print('You are already in Windows. This is as good as it gets.');
          break;
        default:
          print('Bad command or file name');
      }
      print('');
    }

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var val = input.value;
        input.value = '';
        run(val);
      } else if (e.key === 'ArrowUp') {
        if (history.length) {
          historyIdx = Math.max(0, historyIdx - 1);
          input.value = history[historyIdx] || '';
          e.preventDefault();
        }
      } else if (e.key === 'ArrowDown') {
        if (history.length) {
          historyIdx = Math.min(history.length, historyIdx + 1);
          input.value = history[historyIdx] || '';
          e.preventDefault();
        }
      }
    });

    // Clicking anywhere on the screen focuses the input, like a real console.
    var screen = output.parentElement;
    if (screen) {
      screen.addEventListener('mousedown', function (e) {
        if (e.target !== input) {
          // Defer so a text selection isn't stolen.
          setTimeout(function () { input.focus(); }, 0);
        }
      });
    }

    printBlock(BANNER);
    input.focus();
  }

  window.__initDos = initDos;
})();
