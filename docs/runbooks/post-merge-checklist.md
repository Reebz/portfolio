# Post-merge checklist (open across sessions)

Last updated: 2026-05-26 after PR #15 merged.

This file tracks manual/human-only actions left after the mobile Win98 desktop work shipped. Both items survive a `/clear`; pick them up whenever convenient.

---

## #22 — Enable `playwright` required-status-check on main

**Status:** open. Workflow runs on every PR + push to main since PR #13. Status checks are surfaced but not yet *required* to merge.

**Steps:**
1. https://github.com/Reebz/portfolio/settings/branches
2. Add rule (or edit existing) for branch name pattern `main`
3. Check "Require status checks to pass before merging"
4. Search the status-check box for `playwright` and select it
5. Save

After save, any PR with a failing Playwright run is blocked from merging. Useful guard now that the suite spans 5 device projects.

---

## #23 — Walk the mobile real-device runbook

**Status:** open. Runbook authored in PR #12, U8. Still need a real walkthrough.

**Location:** [`docs/runbooks/mobile-real-device-test.md`](./mobile-real-device-test.md)

**Why now:** PR #15 (icon + maximize fix) changed visible chrome on phones. A real-device pass would catch:
- Title-bar icons render as native-size glyphs (small underscore, square, X) centered in 30×30 buttons — no solid black block
- Maximize tap on a window expands to fill viewport above the taskbar (not behind it)
- Start menu → Programs → Back navigation works without the 350ms race window (#26 follow-up)
- Tray clock/counter tap closes an open Start menu (#27 follow-up)

The runbook has 9 ordered steps for iPhone + iPad. Each cross-references the automated spec covering the same behavior, so if a step fails you know which spec to update.

---

## Reference — what shipped in this session arc

| PR | Branch | Outcome |
|---|---|---|
| #8 | feat/mobile-win98-desktop | Mobile responsive port (9 units, 117 tests) |
| #9 | fix/mobile-win98-bugs | 7 real-device bug fixes (4 units, 117 tests) |
| #10 | fix/tablets-use-desktop-view | iPads inherit desktop chrome (touch-detection narrowed to max-width 767px) |
| #11 | fix/arrange-icons-on-load | Auto-arrange icons when persisted positions fall outside viewport |
| #12 | feat/mobile-test-coverage | 8 new test specs, passing across 5 device projects |
| #13 | chore/add-playwright-workflow | `.github/workflows/playwright.yml` — Playwright CI on every PR + push |
| #14 | fix/ci-linux-screenshot-baselines | Linux PNG baselines committed alongside macOS |
| #15 | fix/title-bar-icons-and-followups | Title-bar icons + maximize + follow-ups #24-#28 |

## Reference — what's committed but not yet wired

- `.github/workflows/playwright.yml` runs on every PR + push, exposing the `playwright` status check. Branch protection (#22 above) is the last wire.

## Reference — institutional context for next session

- MemPalace drawer `fe0f9eee` (portfolio_web, 2026-05-21) — five technical learnings from the PR #8 → PR #10 chain. Worth re-reading before touching mobile CSS or the touch-detection contract.
- `docs/plans/2026-05-21-001` / `-002` / `-003-feat-mobile-test-coverage-plan.md` — the three plan documents driving this work. All `status: active` (the `ce-work` skill never flipped them to `completed`; that's only a status-flag distinction, not a state issue).
- Touch-detection contract: `(hover: none) and (pointer: coarse) and (max-width: 767px)`. Mobile = phones only. Tablets get desktop. NEVER use `max-width` alone — see origin learning #4.
