# Rules compliance audit: DeepStruggle engine vs. TS_playfield requirements

Source audited: `vendor/DeepStruggle` at commit `5b95e91` (2026-11-19, "engine: one function fires the
Event a card spent for Operations owes"). All paths below are relative to `vendor/DeepStruggle/`
unless they are this project's own files (`game_resources/`, `src/`, …). Line numbers are for that commit.

Method: read `rules/rules.md`, `rules/rules.json`, `rules/cards.json`, `engine/AGENTS.md`, the engine
sources (`engine/src/*.cpp`, `engine/src/events/*.cpp`, `engine/include/ts/*.hpp`), the WASM binding
(`bindings/wasm/ts_engine_wasm.cpp`, `bindings/state_json.cpp`), and the web page's seating code. I
compared card tables with a read-only script
(`$SP/compare_cards.py`)
and checked a few rules against text pulled out of
`game_resources/TS_Rules_Deluxe.pdf`. Nothing was built or run in the
vendor tree.

Verdict key: **OK** = implemented as required; **DEVIATION** = differs from the rulebook or the card text;
**INTEGRATION** = correct in the engine, but our site must handle it.

---

## 0. Summary table

| # | Requirement | Verdict |
|---|---|---|
| 1 | Standard game with optional cards #104-110 | **OK.** Always included, and there is no option to remove them. |
| 2 | US bid +2, placed only where US already has influence | **OK.** Hard-coded as the last setup step. |
| 3 | Card text follows the latest errata | **OK** for every card spot-checked, with the owner's rulings noted in §3.3. **DEVIATION:** rule 9.5 (China Card may not be played if that stops a scoring card being played) is not enforced. |
| 4 | Tournament held-scoring-card loss | **OK** in the engine. **INTEGRATION:** no reason code for it reaches the display JSON or the WASM API, and `ending_reason()` labels it wrongly. |
| 4b | Mil-ops penalty, DEFCON 1, 20 VP, Europe Control, final scoring, China +1 | **OK** |
| 5 | Nothing depends on which side is human | **OK.** The only per-side state is `seat_rules`, which our site sets. |
| 6 | Rule bits | Top model trained with `OPP_EVENT_GATED` only (feature set 12). Recommended settings are in §6.5. |
| 7 | BUGS.md defects a human could hit | **None of the 4 open bugs can be reached** from a browser game. §7.2 lists other issues found in this audit. |
| — | `game_resources/card_text.json` vs. engine ids and names | **All 110 ids match exactly** (title_en == engine name, byte for byte). text_en == `rules/cards.json` description for all 110. |

---

## 1. Standard game with optional cards #104-110

**Deck construction.** `StateMachine::add_era_cards_to_deck(GameState&, WarEra)`, at
`engine/src/state_machine.cpp:36-43`:

```cpp
for (uint8_t i = 1; i <= 110; ++i) {
    if (i == card_ids::THE_CHINA_CARD) continue; // The China Card is not in deck
    if (CardData::get_card(i).era == era) state.card_locations[i] = CardLocation::DRAW_DECK;
}
```

It is called for EARLY in `init_new_game` (`state_machine.cpp:198`), for MID at the start of turn 4, and
for LATE at the start of turn 8 (`state_machine.cpp:786-790`, inside `finish_end_turn`). Neither era
transition reshuffles the discard pile (Deluxe rule 4.4, `engine/AGENTS.md` §10).

**No option flag exists.** I grepped the engine, bindings, ai, tools and web for any optional-card
toggle and found none. All 110 cards are always in play.

**Era of each optional card.** The card table is `engine/src/card_data.cpp:7-130`, rows
`{id, name, ops, side, era, one_time(*), is_scoring, is_war}`:

| id | name | ops | side | era | starred |
|---|---|---|---|---|---|
| 103 | Defectors (standard, not optional) | 2 | US | EARLY | no |
| 104 | The Cambridge Five | 2 | USSR | EARLY | no |
| 105 | Special Relationship | 2 | US | EARLY | no |
| 106 | NORAD | 3 | US | EARLY | yes |
| 107 | Che | 3 | USSR | MID | no |
| 108 | Our Man in Tehran | 2 | US | MID | yes |
| 109 | Yuri and Samantha | 2 | USSR | LATE | yes |
| 110 | AWACS Sale to Saudis | 3 | US | LATE | yes |

Deck sizes: Early 38 (1-35 without #6, plus 103-106), Mid 48 (36-81 plus 107-108), Late 23 (82-102
plus 109-110), plus the China Card. Every card's era, ops, side and star in `card_data.cpp` matches
`rules/cards.json` (script check: 0 mismatches). The scoring cards are {1, 2, 3, 37, 38, 79, 81} and the
war cards are {11, 13, 24, 36, 102}.

**Setup** (`StateMachine::init_new_game`, `state_machine.cpp:156-207`). The fixed influence matches
Deluxe rule 3.2/3.3, which I checked against the PDF: USSR Syria 1, Iraq 1, N.Korea 3, E.Germany 3,
Finland 1; US Canada 2, UK 5, Iran 1, Israel 1, Japan 1, **Australia 4**, Philippines 1, S.Korea 1,
Panama 1, S.Africa 1. The China Card starts face up with the USSR. The Early War deck is dealt 8+8
**before** placement, alternating one card at a time with the USSR first (tournament rule 11.1.3,
`deal_cards_to_hands`, `state_machine.cpp:67-154`).

> Doc warning: `rules/rules.md` §3 is stale. It says "Australia: 1" and leaves out Canada 2. The engine
> is right and rules.md is wrong. Do not copy rules.md into our help text.

---

## 2. US bid: +2 influence in countries already containing US influence

Setup is three placement stages in `StateMachine::step` (`state_machine.cpp:1026-1075`):

1. USSR places 6 points, one per step, in any `in_eastern_europe` country (`:1028-1039`). Austria and
   Finland count as Eastern Europe.
2. US places 7 in any `in_western_europe` country (`:1042-1053`). When `remaining_steps` reaches 0, it
   sets `pending_ops_value = 1` ("Stage 1") and `remaining_steps = 2` (`:1049-1051`).
3. US places **2 bonus points**, each in a country with `us_influence > 0` at that moment
   (`:1056-1071`). After the second point, `start_turn(state)` begins turn 1.

The action mask is the same definition (`engine/src/action_mask.cpp:454-472`):

```cpp
// Stage 1: 2 Bonus placements in countries with existing US presence
for (uint8_t i = 0; i < 84; ++i) if (state.countries[i].us_influence > 0) mask_out[i] = 1;
```

Properties:
- **Eligible countries:** the fixed US setup countries plus any Western European country the US filled
  in stage 2. This is the usual ITS/ACTS bid ("countries already containing US influence, after
  setup").
- **No per-country cap.** Both points may go to the same country.
- **Mandatory, and always exactly +2.** There is no bid parameter. A different bid would need an
  engine change, which would take the model out of distribution.
- The bid happens after both sides' discretionary setup. The USSR therefore places without seeing the
  bid, while the US sees the USSR placement.
- Test: `engine/tests/test_states.cpp:393` `SetupPhase_USBonusInfluencePlacement`.
- For our UI: during SETUP the display JSON shows `decision_context.pending_ops_value == 1` and
  `remaining_steps` 2 then 1 while the bid is being placed. Use this to label the step "Bid +2".

---

## 3. Card text vs. errata

### 3.1 Which text is the reference
`rules/cards.json` holds the **Deluxe Edition** card text, with Deluxe errata merged. Examples: #49 Missile
Envy is unstarred; #104 says "can not be played as an Event during the Late War"; #106 says "canceled by
Quagmire". Our `game_resources/card_text.json` `text_en` is **byte-identical**
to `cards.json` `description` for all 110 cards. I also read the Chinese text of the spot-check cards;
it is faithful. Minor: #98 `title_zh` drops "Remix".

I could not fetch GMT's newest errata sheet offline. The judgement "matches latest errata" therefore
compares the engine with the Deluxe text in `cards.json` and with the Deluxe rulebook PDF.

### 3.2 Spot checks (handler vs. text)

| card | engine behaviour (file:line) | verdict |
|---|---|---|
| #6 China Card | Never in a hand (location `ONGOING_EVENT`), so it is outside hand limits and discards. Offered only when held and face up, and never in a headline (`action_mask.cpp:230-233`). Its Ops play passes it face down to the opponent (`state_machine.cpp:551-557`). The Asia +1 bonus uses the shared budget ladder `Operations::budget_if_spent_in` (AGENTS §20). Holder gets +1 VP at final scoring (`scoring.cpp:370-375`). Holding only the China Card allows a pass (`action_mask.cpp:214-220`). | OK, except **rule 9.5 bullet 2 is not enforced** (§3.3 D1) |
| #35 Formosan Resolution | Sets a flag (`early_war.cpp:352-355`). Taiwan counts as a battleground if US-controlled, in Asia scoring *and* final scoring (`scoring.cpp:47-52, 79-82`). Not counted for Summit (`scoring.cpp:60-66`). Cancelled when the US plays the China Card, for Ops (`state_machine.cpp:556, 852`) or for Space (`space_race.cpp:110`). | OK |
| #32 UN Intervention | Offered as an Event only if the hand holds an opponent non-scoring card (`card_dispatcher.cpp:162-179`). Never in a headline (`action_mask.cpp:208`; Star Wars `card_dispatcher.cpp:2010`; Grain Sales `action_mask.cpp:257-262`). The step (`card_dispatcher.cpp:850-885`) pays the U-2 rider, discards the companion, grants its Ops with modifiers, and sets `suppress_op_card_event = 1` so the opponent's Event does not fire. It answers We Will Bury You. | OK |
| #43 SALT | DEFCON +2; `SALT_ACTIVE` gives -1 to every coup roll this turn (`ops.cpp:361-364`); optional pick of a **non-scoring** discard (`mid_war.cpp:65-85`, mask `card_dispatcher.cpp:2016-2022`, step `:942-949`). The flag is in `TURN_CLEANUP_MASK`. | OK |
| #49 Missile Envy | `mid_war.cpp:138-216`. Takes the giver's highest-Ops non-scoring card; on a tie the giver chooses. If the card is the receiver's own or neutral, its Event fires. If it belongs to the opponent, the receiver gets its Ops with `suppress_op_card_event`. The giver must play Missile Envy for Ops in its next action round (`forced_card_*`; mask `action_mask.cpp:103-138, 306-312`; the force waits behind a held scoring card or a trap). | OK with one owner ruling: "highest" means **effective** Ops (§3.3 R1) |
| #62 "Lone Gunman" | Reveals the US hand, then grants the USSR 1 Op (`mid_war.cpp:348-358`). Containment/Brezhnev/Red Scare modifiers apply (AGENTS §12). | OK |
| #68 John Paul II | Poland: USSR -2, US +1, and sets `JOHN_PAUL_II_PLAYED` (`mid_war.cpp:484-489`). | OK |
| #95 Latin American Debt Crisis | The US may discard a card worth 3+ **effective** Ops, or decline. Otherwise the USSR doubles its influence in up to 2 different South American countries that hold USSR influence (`late_war.cpp:195-226`, step `card_dispatcher.cpp:1446-1484`, mask `:2045-2053`). | OK (effective-Ops reading, §3.3 R2) |
| #98 Aldrich Ames Remix | Sets `ALDRICH_AMES_ACTIVE` (US hand known for the rest of the turn; cards drawn later also enter `HAND_US_KNOWN`). The USSR **must** discard 1 card from the US hand, and may choose a scoring card (`late_war.cpp:254-272`, step `card_dispatcher.cpp:1634-1641`, mask `:2038-2044`). | OK |
| #101 Solidarity | An Event only after JP2 (`card_dispatcher.cpp:156-157`); adds +3 US influence to Poland (`late_war.cpp:299-304`). | OK |
| #104 The Cambridge Five | No Event from turn 8 on (`card_dispatcher.cpp:158-159`). Reveals the US scoring cards (marks them `known`), then the USSR adds 1 influence to one country in a region one of them names (`early_war.cpp:388-417`, `cambridge_five_allows` `card_dispatcher.cpp:218-238`). | OK |
| #106 NORAD | Flag (`early_war.cpp:443-446`). At the end of each action round, if DEFCON *moved* to 2 in that round and Canada is US-controlled, the US must add 1 influence to a country with US influence (`state_machine.cpp:610-628`, step `card_dispatcher.cpp:1727-1739`). A DEFCON drop in the headline does not trigger it (`state_machine.cpp:295-301`). Quagmire cancels it (`mid_war.cpp:59-63`). | OK |
| #108 Our Man in Tehran | An Event only if the US controls a Middle East country (`card_dispatcher.cpp:286`). Draws 5 (reshuffling mid-draw if the deck runs out). The US discards any of them, and the rest return to the deck (`mid_war.cpp:618-672`). | OK |
| #109 Yuri and Samantha | `YURI_AND_SAMANTHA_ACTIVE`: -1 VP for **every** US coup this turn, free event coups included (`ops.cpp:385-388`). Cleared at turn end. | OK |
| #110 AWACS Sale | Saudi Arabia +2 US; blocks Muslim Revolution's Event (`late_war.cpp:315-319`, `card_dispatcher.cpp:148-149`). | OK |
| #100 Wargames (bonus) | Only at DEFCON 2: the opponent gets +6 VP and the game ends at once, with no final scoring (`late_war.cpp:288-297`, step `card_dispatcher.cpp:1218-1232`). | OK |
| #103 Defectors (bonus) | A US headline cancels the USSR headline. A USSR play in an action round gives the US +1 VP. The US cannot Event it in its own action round (`card_dispatcher.cpp:136-141`, `early_war.cpp:357-386`). | OK |

Starred flags, ops values and sides: all 110 agree between engine and `cards.json`. A few notable ones:
#11 Korean War, #35, #38 SE Asia Scoring, #40 CMC, #43, #46, #62, #100, #102, #106, #108-110 are
starred; #13, #24, #32, #49, #73, #104, #105, #107 are not.

### 3.3 Deviations and owner rulings a rules-aware player might notice

- **D1 — Rule 9.5 bullet 2 not enforced.** Deluxe rule 9.5 (checked in the PDF) says the China Card
  "may not be played ... if it prevents the play of a Scoring card". The standard hand mask
  (`action_mask.cpp:230-233`) offers the China Card whenever it is held, face up, outside a headline. It
  does not check scoring cards held against action rounds left. The trap and Missile-Envy-force paths do
  count scoring cards against rounds left (`action_mask.cpp:176-195, 113-131`); the normal path does not.
  `rules/rules.md` §9.1 states the rule, but the engine does not apply it.
  *Effect:* a player can play the China Card at their last action round while holding a scoring card,
  and then loses under the held-card rule. It only hurts the player who makes the move.
  *Recommendation:* keep the engine as it is (the AI was trained with it). In our UI, disable or warn on
  the China Card for the human when
  `count(scoring cards in hand) >= action rounds the human has left`. More generally, warn whenever a
  play would leave the human unable to play every scoring card.
- **R1 — Missile Envy "highest value"** uses the giver's **effective** Ops: Containment or Brezhnev +1
  (cap 4), Red Scare/Purge -1 (floor 1). Vietnam Revolts is ignored. Source:
  `card_dispatcher.cpp:251-281`, owner's ruling of 2026-11-18. I could not verify it against the GMT FAQ.
- **R2 — Discard thresholds use effective Ops.** This covers Blockade (`early_war.cpp:109-137`), LADC,
  and the Quagmire/Bear Trap discard (`action_mask.cpp:150-165`).
- **R3 — Event-granted Ops take Ops modifiers.** Affects CIA Created, Lone Gunman, Junta, TDTW and
  others. The engine follows Deluxe rule 7.4.3 over the FAQ (`engine/AGENTS.md` §12).
- **R4 — Both players holding a scoring card ends the game as a draw** (VP set to 0,
  `state_machine.cpp:760-761`). The rulebook does not cover this case.

---

## 4. Tournament held-scoring-card rule and other victory conditions

### 4.1 Held scoring card: implemented
End-of-turn flow:
1. `advance_after_action_round` (`state_machine.cpp:605-694`) runs past the last action round.
2. `begin_turn_cleanup` (`:696-707`) opens a chance node (`ROLL_DIE`, `pending_roll = TURN_CLEANUP`,
   decision player NONE). The WASM `drain()` resolves it automatically
   (`bindings/wasm/ts_engine_wasm.cpp:101-114`).
3. `end_turn` (`:709-746`): Phase E mil-ops, then the optional Space box-6 discard. Since ENG-7
   (`action_mask.cpp:46-55`) that discard never offers a scoring card.
4. `finish_end_turn` (`:748-798`), Phase F:

```cpp
if (us_holds || ussr_holds) {                 // state_machine.cpp:758-767
    state.current_phase = Phase::GAME_OVER;
    if (us_holds && ussr_holds) state.victory_points = 0;
    else if (us_holds)          state.victory_points = -20;
    else                        state.victory_points = 20;
    return;
}
```

The check runs every turn, turn 10 included, before final scoring. Test:
`engine/tests/test_state_lifecycle.cpp:306` `TurnEndState_HoldingScoringCard_CausesImmediateLoss`.
In the top model's self-play, 0.9% of games end this way (its behaviour report, line 58).

**The helper functions are in `Engine` (`engine/src/engine.cpp:248-269`, declared
`engine/include/ts/engine.hpp`):**
- `static bool Engine::has_held_scoring_card(const GameState&, Player)`
- `static bool Engine::is_held_scoring_game_over(const GameState&)`: GAME_OVER && defcon > 1 &&
  `action_round > (turn<=3 ? 6 : 7)` && someone holds a scoring card
- `static bool Engine::is_held_scoring_loss(const GameState&, Player)`

These are used only by Python (training rewards and analytics, e.g.
`tests/training/test_credit_assignment.py:789-828`). **They are NOT exported by the WASM build**
(`bindings/wasm/ts_engine_wasm.cpp` has no `ts_*held*`).

### 4.2 How the end reason reaches the page (INTEGRATION)
- `ts_display_json()` (`ts_engine_wasm.cpp:303` → `state_json.cpp:460-749`) has **no reason field**. It
  gives `is_terminal` (bool), `terminal_utility` (+1 US win, -1 USSR win, 0 draw; `state_json.cpp:746-747`),
  `victory_points`, `defcon`, `turn`, `action_round`, `current_phase_name` ("GAME_OVER"), `flags`
  (string array, which includes `"DEFCON_SUICIDE_PROVOKED"`, `"CMC_SUICIDE_LOSS"`,
  `"EUROPE_CONTROL_WIN"`), and `hands.US` / `hands.USSR` (card-id arrays).
- The reason string comes from a separate export, `ts_ending_reason()` (`ts_engine_wasm.cpp:547` →
  `state_json.cpp:1156-1189`). It returns one of `"20 VP"`, `"Europe Control"`, `"wargames"`,
  `"final scoring"`, `"DEFCON 1 (own decision)"`, `"DEFCON 1 (opponent decision)"`.
- **Misclassification:** a held-scoring loss comes out as `"20 VP"` (comment at `state_json.cpp:1181`:
  "20 VP, or a held scoring card"). **Both sides holding** (VP 0, turn ≤ 10, GAME_OVER) comes out as
  `"wargames"`. The DeepStruggle page's catalog (`web/ui/src/i18n/enums.ts:44-51`) has no held-scoring
  entry either.
- **VP is overwritten.** At a held-scoring loss (and a DEFCON-1 loss, or Europe Control) VP is set to
  ±20/0, so the track value from before is lost. Keep the previous display state if you want to show it.

Proposed classifier for our site. It mirrors `Engine::is_held_scoring_game_over`; run it on the
terminal display JSON before trusting `ts_ending_reason()`:

```ts
const SCORING = new Set([1, 2, 3, 37, 38, 79, 81]);
function endingReason(d: any, engineReason: string): string {
  const maxAr = d.turn <= 3 ? 6 : 7;
  const usHeld = d.hands.US.some((c: number) => SCORING.has(c));
  const ussrHeld = d.hands.USSR.some((c: number) => SCORING.has(c));
  if (d.is_terminal && d.defcon > 1 && d.action_round > maxAr && (usHeld || ussrHeld)
      && !d.flags.includes("EUROPE_CONTROL_WIN") && !d.flags.includes("CMC_SUICIDE_LOSS"))
    return usHeld && ussrHeld ? "heldScoringBoth" : usHeld ? "heldScoringUS" : "heldScoringUSSR";
  return engineReason;
}
```

Known ambiguity: the engine's own helper shares it. If the end-of-turn **mil-ops** penalty takes VP to
±20 (which ends the game in `evaluate_military_ops` before Phase F) while someone also holds a scoring
card, both the classifier and `is_held_scoring_game_over` will call it held-scoring. This is rare. To
separate the two, compare with the VP before the cleanup step.

### 4.3 Other end conditions
| rule | implementation | verdict |
|---|---|---|
| End-of-turn mil-ops penalty | `Scoring::evaluate_military_ops` (`scoring.cpp:278-300`). Deficit = max(0, DEFCON − milops) per side. Net applied via `award_vp(ussr_def − us_def)`. Both reset to 0. Skipped if the game is already over. Test `test_state_lifecycle.cpp:281`. | OK |
| DEFCON 1 | `resolve_defcon_one_loss(state, cause_owner)` (`engine/include/ts/defcon.hpp:28-36`): the **phasing player** loses (VP set ±20). Headline: the phasing player is the headline's owner (`state_machine.cpp:1136`, `:280`). A coup to DEFCON 1 still resolves its roll first (`ops.cpp:330-338, 410-413`). The flag `DEFCON_SUICIDE_PROVOKED` records a forced loss (an opponent's card's Event). | OK |
| 20 VP auto-win | `award_vp` (`engine/include/ts/victory_points.hpp:19-29`): clamp to [−20, 20]. Reaching an end sets GAME_OVER at once, and later awards are ignored. Every VP change goes through it (AGENTS §15). | OK |
| Europe Control | `Scoring::score_region` (`scoring.cpp:219-245`), when Europe Scoring is played: VP ±20, flag `EUROPE_CONTROL_WIN`. Also at final scoring (`scoring.cpp:310-327`). Test `test_scoring.cpp:45`, `test_state_lifecycle.cpp:530`. | OK |
| Final scoring after turn 10 | `finish_end_turn` → `Scoring::execute_final_scoring` (`state_machine.cpp:792-797`, `scoring.cpp:302-381`). Europe Control is checked first. All six regions are summed **without** a 20-VP early stop (rule 10.3.2). Shuttle Diplomacy is ignored, Formosan applies. Clamped to ±20 at the end. VP>0 US, <0 USSR, 0 draw (`engine.cpp:240-246`). | OK |
| China Card +1 VP at end | `scoring.cpp:370-375`: the holder gets +1, face up or down. Test `test_state_lifecycle.cpp:368`. | OK |
| Wargames | See §3.2. Reason string `"wargames"`. | OK |

---

## 5. Side selection: nothing depends on which side is human

- `GameState` (`engine/include/ts/game_state.hpp`) has no human or AI field. Grepping the engine for
  `human`, `ai_side`, `bot` finds only comments. The engine models two players, US (+1) and USSR (−1).
- The single model plays either side. Observations are built per perspective
  (`ts_observation_features(player, features)`, `ts_engine_wasm.cpp:704-708`).
- **The only per-side configuration is `GameState::seat_rules[2]`** (`game_state.hpp:377-380`,
  index `seat_index(p)`: US=0, USSR=1). Our site sets it per side (§6). `ALWAYS_ASK_DISCARD` is read
  on *either* seat (`either_seat_plays_rule`, `game_state.hpp:672-674`), so it does not depend on which
  side is human.
- Turn structure is fixed and side-agnostic: USSR sets up first, US second plus the bid; the USSR acts
  first each action round; US wins headline ties. When the human is US, the AI (USSR) places its 6
  setup points first.
- "Random" side is pure UI: pick ±1 on the client. Pass a fresh random **non-zero** 64-bit seed to
  `ts_new_game(lo, hi)`. Seed 0 is replaced by the fixed `0x123456789ABCDEF0`
  (`state_machine.cpp:158`), which would deal the same game every time.

---

## 6. Rule bits

### 6.1 Definitions (`engine/include/ts/game_state.hpp:583-644`)
| bit | value | name | kind | what it changes | read at |
|---|---|---|---|---|---|
| 1 | 2 | OPS_BUDGET | obs block (+3 floats) | observation only | `observation.cpp:480-489` |
| 2 | 4 | HEADLINE_REVEAL | obs, no width | Space box-4 revealed headline shown in card rows | `observation.cpp:522-531` |
| **3** | **8** | **OPP_EVENT_GATED** | **rule** | On an **opponent's** card, EVENT (event-first) is offered only if `can_trigger_event` holds for the owner. Without it, NATO before Marshall/Warsaw Pact, Solidarity without JP2, Cambridge Five in the Late War, Star Wars not ahead, and so on are offered and fizzle into Ops (ENG-9). | `action_mask.cpp:329-333` |
| 4 | 16 | CANONICAL_FIRST | rule (P43 V1) | Placement runs forced into a fixed country order, most important first | `action_mask.cpp:642-655`, `state_machine.cpp:906-950` |
| 5 | 32 | CANONICAL_LAST | rule (P43 V2) | same, most important last | same |
| 6 | 64 | CANONICAL_LEARNED | rule (P43 V3) | Order supplied by the harness (`canon_prio`). **A placement without it is refused** (`state_machine.cpp:910`), so the game stalls if the harness does not supply it. | same |
| 7 | 128 | PLACEMENT_LEGAL | obs, no width | slot 19 = legal mask | `observation.cpp:491-502` |
| 8 | 256 | PLACEMENT_ORDER | obs, no width | slot 19 = 0.5 where the order blocks | `observation.cpp:503-521` |
| 9 | 512 | OWN_EVENT_GATED | rule, for people | Own or neutral card's EVENT offered only if `event_has_effect` holds: One Small Step only when behind in space, Wargames only at DEFCON 2 (`card_dispatcher.cpp:288-297`). A starred one played anyway (a headline) is discarded, not removed. | `action_mask.cpp:334-340` |
| 10 | 1024 | ALWAYS_ASK_DISCARD | rule, for people, **either seat** | Blockade and LADC ask the US even with no 3+ Ops card (its only answer is then CONFIRM_DONE). Missile Envy asks the giver even when only one card qualifies. Outcome is unchanged; only a forced decision is added. | `early_war.cpp:124`, `late_war.cpp:208`, `mid_war.cpp:159` |

Sets: `RULES = 8|16|32|64|512|1024`; `PERSON_RULES = 8|512|1024 = 1544`
(`game_state.hpp:641-643`). `seat_obs_features(state, p, features)` stores `features & RULES` in
`seat_rules[seat_index(p)]` (`:657-659`). **Zero means the pre-ENG-9 rules**, and it is the default for
every new or loaded state.

### 6.2 What the top model was trained under
- From the leaderboard records (`leaderboard/networks.json`, `players.json`, `matches/E8.jsonl`), the
  strongest network is **`E8.1-A8-R132-S45@11160M+(S45,46,47)@11520..11600M`** (HF path
  `_models/E8.1-A8-R132-S45@11160M+(S45,46,47)@11520..11600M.pt`; an ONNX should sit beside it). Greedy,
  it beat the E7 A13 SWA 66% of games. With its rollout root
  (`~rollout(k=4,worlds=64,horizon=4,rule=z2,stop=earlier,leaf=own,chance=keyed,aligned=true,box4=true,race=16)`)
  it beats every other searched player listed. *I worked this out from raw head-to-head results, not the
  fitted Elo. Confirm it against the live leaderboard page.*
- Its feature set is **12 = HEADLINE_REVEAL (4) | OPP_EVENT_GATED (8)**. Sources: its behaviour report
  `research/log/per_checkpoint/E8.1-A8-R132-S45_11160M+_S45_46_47_11520..11600M.md:9` ("observation
  feature bits: 12"); `research/method/run_nomenclature.md:19, 174-176` ("E8.1 is E8 with ENG-9's rule
  bit opp_event_gated"); and DeepStruggle `CLAUDE.md` (E8 default `headline_reveal`, plus
  `opp_event_gated` since 2026-11-06). Action view E4 (no V code, so no CANONICAL bit). Self-play
  seated both sides with these bits, so its opponent also played OPP_EVENT_GATED.
- It was **not** trained with OWN_EVENT_GATED or ALWAYS_ASK_DISCARD. CLAUDE.md says they have "no
  training name, so no network does". No CANONICAL_* or PLACEMENT_* bits either.
- Training settles forced moves (`SettleMode.FORCED` is the default in `bindings/ts_env.py:271, 322`, which
  uses `Engine::auto_advance_step`). The network therefore never chose at single-legal-action decisions
  or at forced event targets.
- Engine fixes made in place after this network was trained (2026-11-15..17): Missile Envy
  effective-Ops ties and Envy under ALWAYS_ASK (2026-11-18); trap vs. Envy deferral (2026-11-18);
  Star Wars/UN Intervention in the headline (§23, 2026-11-18); `ops_spender` (2026-11-19). All are rare
  positions, but the model is slightly out of distribution there.

### 6.3 What the DeepStruggle web page does
`TSApp.seatSides()` (`web/ui/src/main.ts:886-904`) runs on every refresh:

```ts
const features = side === auto && this.model ? this.model.obsFeatures : engine.currentRules;
changed = engine.seat(player, features) || changed;
```

- AI (auto-play) side: the model's ONNX metadata `ts.obs_features` (`web/ui/src/analysis/model.ts:65-70`).
- Person's side: `engine.currentRules` = `ts_obs_features_rules()` = `PERSON_RULES` = **1544**
  (`ts_engine_wasm.cpp:697-699`).
- The rollout search plays both sides of its tree under the network's own bits (`seat_both`,
  `engine/AGENTS.md` §19).

### 6.4 Effect of each bit on the AI's distribution, when set on the human's seat
- **OPP_EVENT_GATED** on the human: the same rule the model's self-play opponent played. In
  distribution.
- **OWN_EVENT_GATED** on the human: changes only the human's own mask, plus one state edge case. If
  the human *headlines* Wargames away from DEFCON 2, the card goes to the discard instead of being
  removed, and it could return after a reshuffle. One Small Step is unstarred, so it causes no state
  difference. It also changes no observation slot of the AI: mask-derived observation slots exist only
  under PLACEMENT_* bits, which this model does not use. Effect on the AI: negligible.
- **ALWAYS_ASK_DISCARD** (either seat): game outcomes are identical. When the AI is US and the human
  plays Blockade or LADC, or the AI is the Missile Envy giver with a single candidate, the AI faces a
  **one-legal-action** decision it never met in training. A masked argmax still picks the only legal
  action, so this is harmless if the harness masks logits (or skips the model).
- **CANONICAL_*** must never be set on either seat for this model. LEARNED would stall the game, and
  FIRST/LAST change the AI's legal sets.

### 6.5 Recommendation: exactly what our site should pass
After **every** `ts_new_game(...)` and **every** `ts_load_save_json(...)` (both rebuild `GameState` from
`GameState{}`, so `seat_rules` returns to {0,0}; saves do not store it, see `state_json.cpp`), and
before the first mask or step:

```ts
const MODEL_FEATURES = Number(onnxMeta["ts.obs_features"]);   // expect 12 for the E8.1 soup; assert it
M._ts_seat_obs_features(AI,    MODEL_FEATURES);               // AI seat rule bits -> 8 (OPP_EVENT_GATED)
M._ts_seat_obs_features(HUMAN, M._ts_obs_features_rules());   // 1544 = OPP|OWN_EVENT_GATED|ALWAYS_ASK_DISCARD
console.assert(M._ts_seat_rules(AI) === 8 && M._ts_seat_rules(HUMAN) === 1544);
// AI inputs: observation ts_observation_features(AI, MODEL_FEATURES); mask ts_mask(0) (E4 view);
// mask logits before argmax; auto-play any AI decision with exactly one legal flat action without
// querying the model, as training's SettleMode.FORCED did.
```

(AI/HUMAN are +1 for US and −1 for USSR.) The raw-byte undo (`ts_state_ptr` / `ts_state_size`) keeps
`seat_rules`, because it is part of `GameState`.

The **strict alternative** is human = 8 (OPP_EVENT_GATED only), an exact copy of the training opponent.
It loses the two person-rules: no dead One Small Step or Wargames Events offered, and no hand-information
leak through Blockade, LADC or Missile Envy. I recommend 1544 because it matches the DeepStruggle page
and the owner's "current rules for a person", and the effect on the AI's distribution is negligible
(§6.4). Never pass bits 16/32/64/128/256 to either seat or to the observation.

---

## 7. Known defects

### 7.1 BUGS.md (all open entries)
| id | area | severity (BUGS.md) | reachable by a human in our browser game? |
|---|---|---|---|
| TEST-1 | `tests/differential/` fails at import | low | **No.** Test suite only. It does mean the cross-engine check against `external/struggler` is not running. |
| CONV-1 (remainder) | verdict bank vs. human-replay converter | low | **No.** Training/eval data only. |
| BIND-1 | nanobind instance collision in long Python scans | low, not reproduced | **No.** Python bindings only. The WASM build does not use nanobind. |
| CONV-3 | converted discard piles drift from turn 4 (human corpus) | low | **No.** Replay conversion only. Missile Envy's receiver solved-hand note is about converting logs, not live play. |

Conclusion: no open BUGS.md defect affects live play.

### 7.2 Other issues from this audit that a human player (or our integration) can hit
| # | issue | severity for us | action |
|---|---|---|---|
| 1 | Rule 9.5 not enforced: the China Card can be played even if that leaves a scoring card unplayable (§3.3 D1) | Medium (rules deviation; harms only the mover) | UI guard or warning for the human; leave the engine alone |
| 2 | No end reason for held scoring: `ts_ending_reason()` says "20 VP", or "wargames" if both hold (§4.2) | Medium (wrong game-over message) | our own classifier, §4.2 |
| 3 | VP overwritten to ±20/0 at a held-scoring, DEFCON-1 or Europe-Control end | Low (display) | show the VP from the previous state if needed |
| 4 | `seat_rules` reset to 0 by `ts_new_game` / `ts_load_save_json` | Medium (silent wrong rules for both seats) | re-seat after both, and assert (§6.5) |
| 5 | `ts_display_json()` contains **both** hands (`hands`, `card_locations`, `legal_actions` of the AI's decisions) | Medium (hidden-info leak if rendered naively) | filter in the UI. The DeepStruggle page withholds the other side's legal actions in player view (`web/ui/src/game/view.ts`). |
| 6 | `GameState.rng_state` decides every future deal and die; undo restores it | Low (same dice after undo; predictable from memory) | acceptable for PvE; consider limiting undo |
| 7 | Seed 0 gives a fixed game | Low | random non-zero seed |
| 8 | Engine fixes made after the model was trained (§6.2) | Low | none; record `ts_fingerprint()` next to the model's `ts.engine_fingerprint` metadata |
| 9 | Owner rulings R1-R4 (§3.3) may be disputed by players | Low | document in our rules help |
| 10 | `rules/rules.md` §3 setup is stale (Australia 1, no Canada) | Low (docs only) | do not reuse rules.md text |

## 8. card_text.json vs. engine
Script output (`compare_cards.py`): for ids 1-110, `card_text.json.title_en` == `card_data.cpp` name
**exactly**, including typographic quotes in “We Will Bury You”, “Lone Gunman”, “Ask Not What Your
Country Can Do For You…”, “One Small Step…” and “An Evil Empire”. `text_en` == `rules/cards.json`
description exactly. Every `title_zh` and `text_zh` is non-empty. **No mismatches.** `card_text.json`
has no ops, side, era or star fields; take those from the engine (`ts_card_ops(id)`, or
`hands.*_cards[].ops` in the display JSON) or from `rules/cards.json`.

## 9. Open questions
1. Is the E8.1 soup really "the single highest-rated model" on the live leaderboard? Should we ship it
   greedy or with its rollout root (the strongest *player*, but heavy on CPU in a single-threaded WASM)?
2. Its ONNX metadata on Hugging Face (`ts.obs_features` = "12"? `ts.engine_fingerprint`?) has not been
   verified. I had no network access to `mihaild/deepstruggle`.
3. Tournament rule 11.1.1 reveals held cards at turn end. The engine does not mark them known. Should
   our UI show the AI's held card to the human at turn end? It would not affect the AI.
4. Human seat: PERSON_RULES (1544, recommended) or strict 8?
