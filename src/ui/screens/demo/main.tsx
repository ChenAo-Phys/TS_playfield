/**
 * Shell demo (dev only; not a production build input): the real GameScreen, composed exactly as the app
 * does, on a recorded fixture (DemoHarness = UiRootProvider + ShownProvider over a FixtureController).
 * The shell's dialogs open for real; "new game" / "result" only log.
 *
 *   http://localhost:5189/TS_playfield/src/ui/screens/demo/index.html?scene=prompt-influence&lang=en
 *
 * Parameters: DemoHarness's (scene, lang, start, speed, motion, view, think, pause…) plus
 *   toolbar=1          the dev toolbar (scene picker, language, replay)
 *   variant=committed  turn 4: your headline committed face down beside an 8-card hand (from prompt-headline)
 */
import { useMemo, useState } from "react";
import { bootDemo, DemoHarness, DemoToolbar } from "../../../dev/DemoHarness";
import type { Fixture } from "../../../dev/fixtureFormat";
import { loadFixture } from "../../../dev/fixtures";
import type { PublicState } from "../../../game/contract";
import { KeymapProvider } from "../../common/keymap";
import { AboutDossier } from "../AboutDossier";
import { ConfirmDossier } from "../ConfirmDossier";
import { GameScreen } from "../GameScreen";
import { SettingsDossier } from "../SettingsDossier";
import { ShellContext, type ShellActions, type ShellDialog } from "../shellContext";
import { ShortcutsSheet } from "../ShortcutsSheet";

const Q = new URLSearchParams(location.search);

function Shell() {
  const [dialog, setDialog] = useState<ShellDialog | null>((Q.get("dialog") as ShellDialog | null) ?? null);
  const [telexKey, setTelexKey] = useState(0);
  const shell = useMemo<ShellActions>(() => ({
    open: d => setDialog(d),
    toStart: () => console.info("[demo] toStart"),
    showResult: () => setTelexKey(k => k + 1),
    gameKey: 0,
    telexKey,
  }), [telexKey]);
  const close = () => setDialog(null);
  return (
    <ShellContext.Provider value={shell}>
      <GameScreen />
      {dialog === "settings" ? <SettingsDossier onClose={close} /> : null}
      {dialog === "about" ? <AboutDossier onClose={close} /> : null}
      {dialog === "shortcuts" ? <ShortcutsSheet onClose={close} /> : null}
      {dialog === "newGame" || dialog === "resign" ? <ConfirmDossier kind={dialog} onClose={close} onConfirm={close} /> : null}
      {Q.get("toolbar") === "1" ? <DemoToolbar /> : null}
    </ShellContext.Provider>
  );
}

/** Stills the recordings don't have. */
async function variantFixture(v: string | null): Promise<Fixture | undefined> {
  if (v !== "committed") return undefined;
  // prompt-headline (turn 4, 9 cards): the first card committed face down, the AI choosing its headline.
  const fx = await loadFixture("prompt-headline");
  const last = fx.frames[fx.frames.length - 1]!;
  const human = fx.humanSide;
  const card = last.state.hands[human][0]!;
  const key = human === "US" ? "headline_us_card" : "headline_ussr_card";
  const state = {
    ...last.state,
    hands: { ...last.state.hands, [human]: last.state.hands[human].filter(c => c !== card) },
    [key]: card,
    headline_stage: 0,
    card_locations: { ...last.state.card_locations, [String(card)]: "HEADLINE_COMMITTED" },
  } as PublicState;
  const frame = { ...last, state, events: [] };
  return {
    ...fx, name: "variant-committed", description: "Your headline committed face down (prompt-headline, edited)",
    frames: [...fx.frames.slice(0, -1), frame],
    final: { ...fx.final, frame, prompt: null, aiThinking: true },
  } as Fixture;
}

void (async () => {
  const fixture = await variantFixture(Q.get("variant"));
  await bootDemo(() => (
    <KeymapProvider>
      <DemoHarness scene="prompt-influence" fixture={fixture}>
        <Shell />
      </DemoHarness>
    </KeymapProvider>
  ));
})();
