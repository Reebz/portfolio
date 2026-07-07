# Portfolio 98

[![playwright](https://github.com/Reebz/portfolio/actions/workflows/playwright.yml/badge.svg)](https://github.com/Reebz/portfolio/actions/workflows/playwright.yml)

My portfolio site styled as a Windows 98 desktop. Static HTML, CSS, and vanilla JavaScript. No frameworks, etc. Hosted on GitHub Pages. 

What's this for? Fun and nostalgia. I wanted to bring back the feeling of the PC on which I built my first website (shoutout to geocities), including the boot sequence and the hardware specs as best as I could remember. I'll keep adding things over time.

**Live:** [reebz.com](https://reebz.com)

## What's in here

- Award BIOS v4.51PG boot sequence with Energy Star logo, Pentium II 233MHz specs, and a DOS beep
- Draggable, resizable windows with minimize, maximize, and close
- Start menu with cascading submenus, Shut Down dialog, and a working Run prompt
- Quick Launch bar, system tray clock (Sydney timezone), and visitor counter
- Right-click context menus on the desktop, title bars, and taskbar
- Desktop icon drag-and-drop with localStorage persistence
- Minesweeper, Calculator, Paint (via jspaint.app), and a paginated Help book
- ICQ visual shell with contact list, status dropdown, and toolbar
- Napster v2.0 BETA 7 with mock search results and in-progress transfers (links out to YouTube)
- Various easter eggs!
- Formspree-powered contact form styled as Outlook Express
- Responsive Win98 desktop on phones — touch drag, single-tap activation, multi-column icon grid, slide-in Start submenus
- iPads inherit the full desktop experience (BIOS boot included)
- 404 page styled as a Windows error dialog

## Tech

- HTML, CSS, vanilla JavaScript
- [98.css](https://jdan.github.io/98.css/) for Windows 98 UI components
- No frameworks, no build step. (npm only for the Playwright test toolchain.)

## Testing

Playwright drives the test suite across five device projects:

- `desktop` (chromium, default viewport)
- `iphone-se` (375×667 emulated WebKit)
- `iphone-14` (390×844 emulated WebKit) — the canonical mobile project
- `iphone-14-pro-max` (430×932 emulated WebKit)
- `ipad-pro-11` (834×1194 emulated WebKit) — tablet-inherits-desktop regression

```bash
npm test                                  # run everything
npx playwright test --project=iphone-14   # one project only
```

CI runs the full suite on every PR + push to `main` via `.github/workflows/playwright.yml`. The `playwright` status check is intended for branch protection.

### Updating screenshot baselines

`tests/mobile-screenshots.spec.js` captures four canonical phone chrome states as PNG baselines under `tests/mobile-screenshots.spec.js-snapshots/`. They run only under the `iphone-14` project so we commit one canonical set, not three.

Playwright stores per-platform baselines (`-darwin.png` for macOS, `-linux.png` for Linux CI). Both must stay in sync — regenerate BOTH when chrome legitimately changes:

```bash
# macOS (your local machine)
npx playwright test mobile-screenshots --update-snapshots --project=iphone-14

# Linux (via the same Docker image CI uses)
docker run --rm --network host -v "$(pwd):/work" -w /work \
  mcr.microsoft.com/playwright:v1.58.2-jammy \
  bash -c "npm ci && npx playwright test mobile-screenshots --update-snapshots --project=iphone-14"
```

Review the updated PNGs in `git diff` to confirm they reflect the intended change before committing.

### Real-device runbook

Automated tests catch most regressions but cannot fully model real iOS Safari touch behavior. Walk through [`docs/runbooks/mobile-real-device-test.md`](docs/runbooks/mobile-real-device-test.md) on an actual iPhone + iPad before merging any PR that touches mobile-affecting code (style.css mobile @media blocks, desktop.js `isMobile()` paths, taskbar/Start markup, or boot.js).

## Acknowledgements

This project uses and is inspired by the work of others. Credit where it's due, thank you.

- **[98.css](https://github.com/jdan/98.css)** by Jordan Scales - Windows 98 CSS component library (MIT)
- **[Win98 Icons](https://win98icons.alexmeub.com/)** by Alex Meub - icon pack
- **[Perfect DOS VGA 437](https://www.dafont.com/perfect-dos-vga-437.font)** - BIOS boot sequence font
- **[JS Paint](https://github.com/1j01/jspaint)** by Isaiah Odhner - MS Paint clone (MIT)
- **[Formspree](https://formspree.io/)** - contact form backend
- **[cmatrix](https://github.com/abishekvashok/cmatrix)** by Abishek V Ashok - Matrix rain visual inspiration (GPL-3.0)
- **[win98ge](https://github.com/gelasioebel/win98ge)** by Gelasio Ebel - visual reference (BSD)
- **[window98-html-css-js](https://github.com/lolstring/window98-html-css-js)** - implementation reference (MIT)
- **[Minesweeper](https://github.com/nickarocho/minesweeper)** by Nick Arocho - game reference
- **The Way of Code** - book content adapted by Rick Rubin, source at [thewayofcode.com](https://www.thewayofcode.com)
- **Windows 98 logo on Clouds** wallpaper — Microsoft Windows 98 (1998), upscaled for modern displays

## License

Code is MIT. Third-party assets retain their original licenses as noted above.
