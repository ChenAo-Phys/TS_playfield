# QA round 2 report (integration, 2026-11-23)

## What QA covered

**Four QA agents** (reports in `docs/qa/r2-*.md`):
- **r2-long:** 5 dev games (3 complete, plus a full 1600×900 zh game) and 2 production sessions with the full-strength AI. The screen matched the game at all 1318 checkpoints, and every scoring play and final scoring was checked.
- **r2-tablet-touch:** complete touch games on an iPad landscape (1024×768 en) and an iPad portrait (768×1024 zh), plus 360×740 zh, with rotations, the quick second tap, spines, the AI wait and focus.
- **r2-visual:** 1368 audit jobs (57 states × 10 viewports × en/zh/en-XA), spine crops, the matrix, and production checks.
- **r2-review:** an adversarial code review of the round-1 fixes and the decided-phase work (r2-hand-wait, r2-save).

**Leftovers:** the 8 items from the decided phase (L-1 … L-8).

**Triage:** 20 findings became 19 items: 5 major, 11 minor, 3 polish. None was a blocker and none needed an owner decision. 3 were deferred.

**Fix groups:**
- F1 (engine side): R-001 … R-005.
- F2 (map and stage): R-006 … R-008.
- F3 (prompts, tray, cards, common): R-009 … R-016.
- F4 (console, rail, shell): R-017 … R-019.

## Items

All 19 are fixed. I re-checked each one by following its repro on dev port 5195 or with the Node tools.

| Id | Sev | Item | Re-check |
|---|---|---|---|
| R-001 | major | English card text was missing printed clauses | The #73 zoom shows "Does not count for Final Scoring…" and no "which ever"; the test pins all six clauses. |
| R-002 | major | Wrong "Mil ops" on free event coups | The integrator applied the contract field and the tooltip change. `freecoup.mjs`, with the tooltip's new rule: 11 of 11 coups match what the engine credits. Junta and Tear Down This Wall free coups show no line; ordinary coups show the right number. `che.mjs`: `milOps` 3, and the engine credits 3. |
| R-003 | minor | Two tabs after a refused write | `quota.mjs`, seeds 6 and 9: tab A is superseded, B's save is kept and B's game goes on. |
| R-004 | minor | A cancelled headline flew from the deck | Flight probe, seed 3 US, 1440×900 normal speed: no flight of card 9 at all; only Defectors flies, from the hand. |
| R-005 | polish | Dead key `slip.ai.stillThinking` | It is gone from the catalogs and the code. The ui-spec §14.1 row is fixed. |
| R-006 | major | The reveal dock covered the scoring sheet | At 1280×720 (Europe) and 1920×1080 (Africa) the dock moved to x 28–228, clear of the sheet. On the tablet (`t7-scoring`, seed 3) all 4 sheets have 0 px overlap and no hidden cells. |
| R-007 | major | AI space-race plays named a country | F2 had marked it partial; the integrator completed it (OrdersSlip). Seed 3, T4 AR7: the dock reads "SPACE RACE 1 OP" and the crumb "OAS Founded › Space race", with no arrow. |
| R-008 | major | The plate popover outlived its prompt | `t8-plate`, 1024×768 en and 360×740 zh: the popover is gone at the next prompt, at play-mode and the card sheet, after rotation, and after a tap. |
| R-009 | minor | Chernobyl's Undo pushed off the tablet slip | 7 viewport/language combinations: Undo is inside the slip and can be hit everywhere. The only cut name is en-XA's "MIDDLE EAST" on the 1440 desktop slip (pseudo-locale). |
| R-010 | minor | Touch targets below 44 px on the tablet | 1024×768 touch: no control under 44 px in 4 scenes (the play-mode scene only lists controls the stage covers on purpose). Flyout check: × and strip pass. Compact zoom buttons pass. |
| R-011 | minor | Key caps on touch screens | 20 scene/viewport combinations at 1024×768 and 360×740: 0 visible key caps. Follow-up applied by the integrator: see "Fixed by the integrator" below. |
| R-012 | minor | Tablet titles cut after two lines | 4 cut tablet titles are `role=button` with `aria-expanded` false; a tap sets it to true and the full text shows. |
| R-013 | minor | Deformed zh spine endings | 1024 zh: "红色恐慌／大" and "我们在德黑兰" end in drawn dots with no overflow; 殖民地后卫部队 is whole. |
| R-014 | minor | Mid-round game end read "End of turn N" | vp20 reads "Orders · Turn 5 · AR 2" with console "AR 2" (zh: 第 5 回合 · 第 2 行动轮). DEFCON reads "Turn 4 · AR 7". The held-scoring ending reads "End of turn 7". |
| R-015 | minor | China Card realign hint | Before the roll: "5/5 ROLLS LEFT The China Card gives one more roll only if every roll is in Asia…". After a roll in Iran: "4 Ops 3/5", with the same hint first. |
| R-016 | polish | Focus after Esc on the China Card | Seeds 1 (1440) and 3 (1024): `[data-card=6]` has focus at 0.1, 0.4, 1 and 3.5 s. |
| R-017 | minor | Tablet flyout over the tray | Every panel ends at y ≤ 622, with the tray starting at 630. 8 of 8 outside taps close it. |
| R-018 | minor | Tampered save reported as another version | en and zh: the tampered save gives `reason` "unreadable" and the new toast; another build's save gives "build" and the old text; a refused resume gives the new toast. |
| R-019 | polish | zh dock said 记录 | 360 and 390 zh: the dock reads "电报" (not cut), its label "手牌、对手、电报与状态", and no 记录 remains on the page. |

### Fixed by the integrator

- **Key caps on touch (R-011 follow-up).** Most buttons had no `aria-keyshortcuts`, so on touch screens nothing exposed their shortcuts once the caps were gone. The driver found done buttons by their cap, so the phone game needed 3 fallbacks:
  - Our Man in Tehran
  - the Eagle Has Landed discard
  - Ask Not

  `Button` now derives `aria-keyshortcuts` from a single-key cap (`kbdShortcut`), and `play.mjs` finds buttons by cap or by `aria-keyshortcuts`. The phone game rerun has 0 fallbacks.

## Not reproduced, deferred, owner decisions

- **Not reproduced:** none.
- **Deferred** (unchanged from the triage):
  - D-201: compact drawer focus after Esc.
  - D-202: coup strings that state the maximum Ops (no surface prints them).
  - D-203: no notice when storage is blocked.
- **Owner decisions from the triage:** none. I add one about publishing, listed under owner decisions.

## Cross-group requests applied

**Contract** (additive, optional, in `src/game/contract.ts`):
- `CoupOdds.milOps?`
- `ViewModel.incompatibleSave.reason?: "build" | "unreadable"`

`ui-contract.ts` is unchanged.

**Code:**
- `controller.ts` `readResumable` sets `reason`; `previews.ts` returns plain `CoupOdds`.
- `CountryTooltip` gets `coupMilOps` (R-002).
- `OrdersSlip` `useAiPlay` uses `rollCountry` (R-007).
- `GameScreen` passes `promptKey` (R-008).
- Map zoom buttons get 44 px hit areas: tablet buttons 36 px and 8 px apart, compact 40 px (R-010, F2 part).
- `GameOverTelex` uses `displayTurnAr` (R-014, optional).
- zh `over.fullLog` becomes 完整电报 and `shortcuts.row.log` becomes "… · 打开电报" (R-019 follow-up).

**Already done by their owners:** console and rail hit areas, and the Menu key cap (F4).

**Docs:**
- `ui-spec.md` has 21 "As built (QA round 2)" notes: §3.2, §3.3, §4.5, §4.8, §5, §7.1, §7.2 (spines, R-013, R-016), §8.1 (AI wait, title toggle, head, AI crumb), §8.2 (tap queue), §8.6, §8.11, §8.12, §9.5 (AI wait, dock vs sheet and trays), §9.6, §10.2, §11.1 (save v2, R-018, R-003), §12 and §14.1. The §14.1 table rows are fixed too.
- ARCHITECTURE.md: the Persistence row (L-6).
- Handoffs: logic.md, ui-shell.md §13 (with the list of storage keys for L-3), ui-common, ui-prompts, ui-stage and map.

## Verification

- **Typecheck:** tsc reports no errors.
- **Tests:** vitest (all, 8 workers): 74 files passed and 2 skipped; 1266 tests passed and 2 skipped.
- **Build:** 247 files, 28 MB.
  - The rulebook appears only as the gmtgames link.
  - No PDF or JPG files.
  - No `__tsp`, `__tspAuto`, `TS_map` or fixture code.
- **Preview smoke:** Ready in 0.6 s, no dev hooks. The full-strength AI made 24 decisions (28 s) up to turn 1 AR 3. The v2 "TSP2:" save decodes, and reload → Resume returns to the same spot. 0 errors.
- **Play-throughs, all 0 fallbacks / 0 mismatches / 0 errors:**
  - USSR at 1440×900 en, seed 13: US +7.
  - US at 390×844 zh touch, seed 1, rerun: US +20.
  - Tablet 1024×768 touch, seed 3: USSR +2.
  - Keyboard only at 1440×900: turns 1–2, 60 answers, 0 issues.
- **Matrix:** 84 shots, 70 changed, all as intended (spines, no touch key caps, wider language switch, dock avoidance, title lines, dice timing).

## Remaining issues (none blocking)

1. **Tablet console wider than the screen (minor, from before this round).** In the tablet layout below about 960 px wide, the language switch, ⚙ and ☰ go off-screen (720×520 zh: 967 px of content). The wordmark still opens the menu.
2. **Log filters too small (minor).** All / Plays / Dice are 17 px tall on touch.
3. **Compact ticker strip (polish, found this round).** "Open the log" / 打开电报 is a 28 px tall tap strip.
4. **Compact touch nits (polish):** the 南美洲 chip is 34 px wide at 360 zh; the landscape sheet grab loses 12 px off-screen; the compact ☰ is 44×43 at 844×390.
5. **Tablet slip areas (polish):** the setup-place hit area is 36 px, and the region bottom row is 37–38 px at 1100×700.
6. **en-XA only (polish):** "MIDDLE EAST" is cut on desktop region buttons.
7. **Contrast tool (L-7, next QA round):** contrast tools must parse `color(srgb …)` for the map names.
8. **Deferred:** D-201, D-202, D-203.

## Coordinator notes (after integration)

- Local paths: the absolute home-directory and session-scratch paths in 21 committed files (docs/qa, docs/notes,
  DEPLOY.md, tools/notes/*.py) were replaced with repo-relative paths, `~/.local/…`, or `$SP` (the QA session's
  scratch directory, not in the repository) before the first commit.
