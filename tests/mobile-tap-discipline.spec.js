// U1 — Real-tap discipline (meta-test).
//
// Greps every tests/mobile-*.spec.js file (except this one) for the
// forbidden pattern `dispatchEvent('click')` (or "click"). That pattern
// bypasses Playwright's touch synthesis pipeline and masks the class of
// touch-action propagation bugs that caused B1 in PR #8. Any new use must
// carry an explicit `// real-tap-discipline-exempt: <reason>` comment on
// the same line documenting why the synthetic dispatch is necessary.
//
// Runs under the desktop project (file-system reads only, no browser
// needed). The playwright.config.js testMatch for desktop has been widened
// to allow this single mobile-prefixed spec.
//
// Origin: docs/plans/2026-05-21-003-feat-mobile-test-coverage-plan.md U1 / R1.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

// Forbidden pattern: dispatchEvent('click') or dispatchEvent("click").
// Tabs and spaces inside the parens are allowed for any future formatter
// drift. Captured group preserved for clearer error output if needed.
const FORBIDDEN = /dispatchEvent\(\s*['"]click['"]\s*\)/;
const EXEMPT_MARKER = '// real-tap-discipline-exempt:';

const TESTS_DIR = path.join(__dirname);
const SELF_NAME = path.basename(__filename);

function listMobileSpecs() {
  return fs
    .readdirSync(TESTS_DIR)
    .filter((f) => /^mobile-.+\.spec\.js$/.test(f))
    .filter((f) => f !== SELF_NAME)
    .map((f) => path.join(TESTS_DIR, f));
}

function scanForViolations(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const violations = [];
  lines.forEach((line, idx) => {
    if (FORBIDDEN.test(line) && !line.includes(EXEMPT_MARKER)) {
      violations.push({
        file: path.relative(process.cwd(), filePath),
        lineNumber: idx + 1,
        text: line.trim(),
      });
    }
  });
  return violations;
}

test.describe('Real-tap discipline', () => {
  test('no mobile spec uses dispatchEvent("click") without an exempt comment', () => {
    const specs = listMobileSpecs();
    // Sanity: the audited suite must contain at least one mobile-*.spec.js
    // file. Otherwise this meta-test is a silent no-op.
    expect(specs.length).toBeGreaterThan(0);

    const allViolations = specs.flatMap(scanForViolations);

    if (allViolations.length > 0) {
      const summary = allViolations
        .map((v) => `  ${v.file}:${v.lineNumber}  ${v.text}`)
        .join('\n');
      throw new Error(
        `Found ${allViolations.length} forbidden dispatchEvent('click') call(s) ` +
          `in mobile specs without an exempt comment. Replace with page.tap() / ` +
          `locator.tap(), or add \`${EXEMPT_MARKER} <reason>\` on the same line ` +
          `if the synthetic dispatch is genuinely required.\n\n${summary}`
      );
    }
  });
});
