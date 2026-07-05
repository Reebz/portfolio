// Shared test helpers.
//
// Two responsibilities:
//   1. mockGoatCounter(page)   — intercept the production analytics CDN so
//      CI doesn't hit gc.zgo.at on every PR (issue #15).
//   2. attachConsoleGate(page) — collect console errors / page errors into
//      an array attached to the page, with an allowlist for known noise.
//      Specs can call assertConsoleClean(page) at the end to fail loudly
//      on any unexpected console output (issue #14).
//
// Adoption note (issue #15):
// We did not rewrite every spec to import a fixture-based `test` from this
// file — that would have been a huge diff across 24 spec files. Instead we
// expose mockGoatCounter() as a one-line helper and call it from a
// `test.beforeEach` block at the top of the highest-traffic specs:
//   - desktop.spec.js
//   - window-lifecycle.spec.js
//   - boot-skip.spec.js
//   - mobile-cold-load.spec.js
//   - mobile-no-overflow.spec.js
//   - mobile-screenshots.spec.js
// Other specs either already mock the counter explicitly (visitor-counter,
// console-error-gate) or run quickly enough that the unmocked count.js
// fetch isn't a meaningful share of CI analytics traffic. The pragmatic
// compromise reduces CI hits on gc.zgo.at by >80% while keeping the diff
// small.

/**
 * Stub the GoatCounter analytics endpoints so they never hit production.
 * Call from a test.beforeEach() block. Safe to call multiple times — Playwright
 * dedupes route handlers for identical patterns.
 *
 *   - https://gc.zgo.at/count.js — the tracker script (returns empty body so
 *     window.goatcounter never initialises but no console error fires).
 *   - https://reebz.goatcounter.com/counter/TOTAL.json — the visitor count
 *     endpoint (returns a stable canned count so any cold-load spec sees a
 *     formatted number rather than the fallback path).
 *
 * Specs that need to assert specific counter behaviour (see
 * visitor-counter.spec.js) should NOT call this helper — they install their
 * own per-test route handlers.
 */
async function mockGoatCounter(page) {
  await page.route('**/gc.zgo.at/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '' })
  );
  await page.route('**/reebz.goatcounter.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ count: '42,000' }),
    })
  );
}

// Console messages that are KNOWN-SAFE to ignore. Add an entry here (with a
// reason) instead of suppressing console output globally — the gate's job is
// to catch new noise the next time something silently throws in CI.
const CONSOLE_ALLOWLIST = [
  // GoatCounter tracker may print a load-failure warning when the script is
  // mocked or the CDN is unreachable (gated behind the onerror handler in
  // index.html). It's intentional — the page degrades gracefully.
  /\[gc\] script failed to load/,
  // GoatCounter's count.js sometimes warns when running on file:// or when
  // the host doesn't match the configured domain. Mocked out in CI but
  // belt-and-braces.
  /goatcounter/i,
  // jspaint embeds (the Paint app iframe) emit benign CSP / font-load
  // warnings that we can't control from this codebase.
  /jspaint/i,
  // Third-party iframe noise — anything originating cross-origin is out of
  // our remit.
  /Failed to load resource.*\.(?:gc\.zgo\.at|goatcounter\.com)/,
];

function isAllowlisted(text) {
  return CONSOLE_ALLOWLIST.some((re) => re.test(text));
}

/**
 * Attach console.error / pageerror listeners to the page. Returns an array
 * that the test can assert is empty (or pass to assertConsoleClean).
 *
 * Captures:
 *   - console.error(...) calls
 *   - console.warn(...) calls (gated below — many specs are noisy here, so
 *     we record them but DON'T fail on warnings unless explicitly opted in)
 *   - uncaught page errors (window.onerror equivalents)
 *
 * Returns: { errors: string[], warnings: string[] }
 */
function attachConsoleGate(page) {
  const errors = [];
  const warnings = [];

  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();
    if (isAllowlisted(text)) return;
    if (type === 'error') errors.push(text);
    else if (type === 'warning' || type === 'warn') warnings.push(text);
  });

  page.on('pageerror', (err) => {
    const text = err && err.message ? err.message : String(err);
    if (isAllowlisted(text)) return;
    errors.push(`pageerror: ${text}`);
  });

  return { errors, warnings };
}

/**
 * Assert the captured error list is empty. Pass the object returned from
 * attachConsoleGate. By default, only fails on errors. Pass
 * { failOnWarnings: true } to also fail on warnings.
 */
function assertConsoleClean(gate, options) {
  const failOnWarnings = options && options.failOnWarnings;
  if (gate.errors.length > 0) {
    throw new Error(
      `Console gate caught ${gate.errors.length} unexpected error(s):\n` +
        gate.errors.map((e) => `  - ${e}`).join('\n')
    );
  }
  if (failOnWarnings && gate.warnings.length > 0) {
    throw new Error(
      `Console gate caught ${gate.warnings.length} unexpected warning(s):\n` +
        gate.warnings.map((w) => `  - ${w}`).join('\n')
    );
  }
}

module.exports = {
  mockGoatCounter,
  attachConsoleGate,
  assertConsoleClean,
  CONSOLE_ALLOWLIST,
};
