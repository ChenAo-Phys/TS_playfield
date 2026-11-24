# QA round 3 report (2026-11-23)

Round 3 fixed the leftovers from round 2, ran QA on the live site (`r3-live.md`) and on Firefox and WebKit
(`r3-xbrowser.md`), fixed what those found, and had two adversarial reviewers read the diff. To save cost, the
coordinator stopped the integration agent early and did a short final verification instead (below). There were no
full-game regression runs and no new screenshot matrix this round.

## Fixed

- **Leftovers from round 2:**
  - The tablet console now fits below about 960 px (R3-06).
  - Touch targets reach 44 px: the log filters (R3-07), the compact ticker (R3-08), the theatre chip and ☰ (R3-09),
    the tablet slip controls (R3-03) and the About links on phones (L-7).
  - Compact Esc / Back to hand focuses the card in the hand drawer (R3-04, R3-10).
  - A one-time toast appears when the game cannot be saved (`ViewModel.saveUnavailable`, R3-01, R3-11).
  - The coup strings no longer overstate the Ops (R3-02).
  - The en-XA region names fit (R3-05).
- **Live site:**
  - The start screen's boot line no longer sticks at "AI model 15 %" after New game (L-1).
  - Downloading the AI no longer counts as "Still thinking" (L-2).
  - The onnxruntime wasm is kept in Cache Storage, so a deploy does not force a 3.7 MB re-download (L-4).
  - The language key is now `ts-playfield.lang`, migrated from `tsp.lang` (L-6).
- **Cross-browser:**
  - WebKit touch no longer swallows the first tap on a map box (X-1).
  - The Firefox coin-toss seal is drawn in its button (X-2).
  - Firefox (159) and WebKit (27.2) now run on this machine. `play.mjs` and `shoot.mjs` take
    `--browser chromium|firefox|webkit`.
- **CSP:** a build-only `<meta>` Content-Security-Policy (`vite.config.ts`, `tsp-csp-meta`).
- **Review:** both reviewers found the same blocker. The R3-03 crumb yield fed back into its own measurement, so
  tablet slips 770–798 px tall crashed the page ("Maximum update depth exceeded"). The fix: a yielded crumb keeps
  its top margin (`OrdersSlip.module.css`).

## Deferred

- **L-3, first visit on Fast 4G:** 9.7 MB, about 10 s to Ready. Starting the AI downloads earlier was measured and
  did not help, so it was taken back out.
- **X-3:** the CSP's `'wasm-unsafe-eval'` needs Chrome 97 or later. This is accepted.
- **R3-09, the landscape sheet grab:** the grab's top 12 px is still off-screen at 844×390.

## Final verification (coordinator)

- **Typecheck and tests:** tsc reports no errors. vitest (all): 84 files passed and 2 skipped; 1345 tests passed
  and 2 skipped.
- **Production build in Chromium, Firefox and WebKit:** each reached Ready (0.55 / 0.84 / 1.10 s) and started a
  game with the real AI. There were 0 CSP violations and 0 errors.
- **Autopilot at the former crash heights,** through turn 3, with 0 fallbacks, 0 mismatches and 0 errors:
  - 1024×785, touch, zh
  - 900×780, touch, en
