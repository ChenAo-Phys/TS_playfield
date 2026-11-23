/**
 * Stage demo (dev only; not a production build input): the stage over the real map on a recorded
 * fixture. Sequences replay through the real frame runner (reveal dock, dice, papers, scoring, banners,
 * game over as they happened); the "moments" buttons play single beats through the director on the
 * fixture's board (every scoring region, every die kind, both era banners, every ending).
 *
 *   TSP_VITE_CACHE=node_modules/.vite-5187 npx vite --port 5187 --strictPort
 *   http://localhost:5187/TS_playfield/src/ui/stage/demo/index.html?scene=prompt-midgame&lang=en
 *
 * Parameters: those of DemoHarness (scene, lang, speed, motion, view, pause=off…) plus
 *   moment=<id>   play a moment once the board is up (ids: the buttons' `data-moment`)
 *   hold=<n>      multiply reading holds of moments (screenshots of transient states)
 *   chrome=0      hide the dev panel (screenshots)
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { DieRollState } from "../../../engine/types";
import type { Ending, EndingReason, Frame, GameEvent, PublicState, Side } from "../../../game/contract";
import { bootDemo, DemoHarness, DemoToolbar, useDemo } from "../../../dev/DemoHarness";
import { CardBack } from "../../cards/CardBack";
import { CardFace } from "../../cards/CardFace";
import { Button } from "../../common/Button";
import { Toaster } from "../../common/Toaster";
import { MapView, useMapBeats, type MapHandle } from "../../map";
import { FlightLayer } from "../../runner/FlightLayer";
import { useOnCommit, useShown } from "../../runner/ShownContext";
import { useUiRoot, useVm } from "../../state/context";
import { frameSpeed } from "../../theme";
import type { Beat, BeatContext, RegionSlot } from "../../ui-contract";
import { DangerFrame, GameOverTelex, Stage, useStageStore, useStageWaiting } from "..";
import s from "./demo.module.css";

const q = new URLSearchParams(location.search);
const HOLD = Math.max(0, Number(q.get("hold")) || 1);
const CHROME = q.get("chrome") !== "0";

interface Moment {
  id: string;
  label: string;
  group: string;
  run(api: MomentApi): Promise<void>;
}

interface MomentApi {
  play(beat: Beat, events?: GameEvent[], patch?: Partial<PublicState>): Promise<void>;
  state: PublicState;
  ai: Side;
  human: Side;
  setEnding(e: Ending | null): void;
  wait(ms: number): Promise<void>;
}

const roll = (r: Partial<DieRollState> & { type: string }): DieRollState => ({ card_id: 0, card_name: "", country_id: 255, country_name: "", mod1: 0, mod2: 0, net_delta: 0, roll1: 1, roll2: 0, roller: "US", success: false, total1: 1, total2: 0, ...r });

const ending = (reason: EndingReason, winner: Side | "DRAW", vpFinal: number, extra: Partial<Ending> = {}): Ending => ({ reason, winner, vpFinal, vpBefore: vpFinal, turn: 7, ...extra });

const MOMENTS: Moment[] = [
  // ── AI play: reveal dock with avoidance and collapse ──
  {
    id: "dock", group: "AI play", label: "AI influence near the dock → collapse",
    async run({ play, ai, wait }) {
      const card = 32; // UN Intervention: a neutral 1-Op card
      await play({ k: "reveal", side: ai, card, how: "influence", byHuman: false });
      for (const c of [45, 44, 43]) {
        await play({ k: "country", country: c, influence: [{ side: ai, from: 0, to: 1 }] }, [{ t: "influence", country: c, side: ai, from: 0, to: 1 }]);
        await wait(300);
      }
      await wait(1500);
      await play({ k: "track", event: { t: "action-round", ar: 4, side: ai === "US" ? "USSR" : "US" } }, [], { card_locations: { [card]: "DISCARD_PILE" } } as Partial<PublicState>);
    },
  },
  {
    id: "dock-coup", group: "AI play", label: "AI coup with an opponent card",
    async run({ play, ai, human }) {
      const card = human === "US" ? 26 : 30; // an opponent card for the AI: the note shows
      await play({ k: "reveal", side: ai, card, how: "coup", byHuman: false });
      await play({ k: "roll", roll: roll({ type: "COUP", roller: ai, country_id: 59, country_name: "Angola", roll1: 5, mod1: 1, total1: 6, mod2: 2, total2: 2, success: true, net_delta: 4 }) },
        [{ t: "influence", country: 59, side: human, from: 2, to: 0 }, { t: "influence", country: 59, side: ai, from: 0, to: 2 }]);
      await play({ k: "country", country: 59, influence: [{ side: human, from: 2, to: 0 }, { side: ai, from: 0, to: 2 }], control: { from: human, to: ai } });
    },
  },
  {
    id: "dock-pinned", group: "AI play", label: "Pinned dock (hold)",
    async run({ play, ai }) {
      await play({ k: "reveal", side: ai, card: 49, how: "event", byHuman: false });
    },
  },
  // ── Headline ──
  {
    id: "headline", group: "Headline", label: "Headline reveal",
    async run({ play }) { await play({ k: "headline-reveal", us: 24, ussr: 18, first: "US" }); },
  },
  {
    id: "headline-defectors", group: "Headline", label: "Defectors cancels",
    async run({ play }) {
      await play({ k: "headline-reveal", us: 103, ussr: 21, first: "US" },
        [{ t: "card-played", side: "US", card: 103, how: "headline" }, { t: "card-moved", card: 21, from: "HEADLINE_COMMITTED", to: "DISCARD_PILE" }]);
    },
  },
  // ── Scoring ──
  ...([[2, "Europe"], [3, "Middle East"], [38, "SE Asia"], [37, "C. America"], [79, "Africa"]] as const).map(([card, name]): Moment => ({
    id: `scoring-${card}`, group: "Scoring", label: name,
    async run({ play, ai }) {
      await play({ k: "scoring", card, vp: 0, scores: { regions: [], ignored_flags: [] } }, [{ t: "card-played", side: ai, card, how: "scoring" }]);
    },
  })),
  // ── Banners ──
  ...([4, 8, 6] as const).map((turn): Moment => ({
    id: `banner-${turn}`, group: "Turn banner", label: `Turn ${turn}`,
    async run({ play }) { await play({ k: "banner", kind: "turn", turn }); },
  })),
  {
    id: "banner-headline", group: "Turn banner", label: "Headline phase",
    async run({ play }) { await play({ k: "banner", kind: "phase", phase: "HEADLINE" }); },
  },
  // ── Dice ──
  {
    id: "dice-coup", group: "Dice", label: "Coup (Cuba)",
    async run({ play }) {
      await play({ k: "roll", roll: roll({ type: "COUP", roller: "US", country_id: 71, country_name: "Cuba", roll1: 6, mod1: 3, total1: 9, mod2: 6, total2: 6, success: true, net_delta: 3 }) },
        [{ t: "influence", country: 71, side: "USSR", from: 3, to: 0 }]);
    },
  },
  {
    id: "dice-realign", group: "Dice", label: "Realignment (Syria)",
    async run({ play }) {
      await play({ k: "roll", roll: roll({ type: "REALIGNMENT", roller: "US", country_id: 22, country_name: "Syria", roll1: 5, mod1: 1, total1: 6, roll2: 2, mod2: 1, total2: 3, success: true, net_delta: 3 }) },
        [{ t: "influence", country: 22, side: "USSR", from: 3, to: 0 }]);
    },
  },
  {
    id: "dice-war", group: "Dice", label: "War (Indo-Pakistani)",
    async run({ play }) {
      await play({ k: "roll", roll: roll({ type: "WAR_EVENT", roller: "US", card_id: 24, card_name: "Indo-Pakistani War", country_id: 33, country_name: "India", roll1: 5, mod1: -1, total1: 4, mod2: 4, total2: 4, success: true }) },
        [{ t: "influence", country: 33, side: "USSR", from: 1, to: 0 }, { t: "influence", country: 33, side: "US", from: 0, to: 1 }, { t: "vp", from: 0, to: 2 }]);
    },
  },
  {
    id: "dice-space", group: "Dice", label: "Space race",
    async run({ play, human }) {
      await play({ k: "roll", roll: roll({ type: "SPACE_RACE", roller: human, card_id: 6, roll1: 2, mod1: 3, total1: 5, success: true }) }, [{ t: "space", side: human, from: 2, to: 3 }]);
    },
  },
  {
    id: "dice-summit", group: "Dice", label: "Summit",
    async run({ play }) {
      await play({ k: "roll", roll: roll({ type: "SUMMIT", roller: "USSR", card_id: 48, roll1: 3, mod1: 1, total1: 4, roll2: 5, mod2: 1, total2: 6 }) }, [{ t: "vp", from: 0, to: -2 }]);
    },
  },
  {
    id: "dice-olympics", group: "Dice", label: "Olympic Games",
    async run({ play }) {
      await play({ k: "roll", roll: roll({ type: "OLYMPIC_GAMES", roller: "USSR", card_id: 20, roll1: 3, mod1: 2, total1: 5, roll2: 4, total2: 4 }) }, [{ t: "vp", from: 0, to: -2 }]);
    },
  },
  {
    id: "dice-trap", group: "Dice", label: "Trap escape",
    async run({ play }) {
      await play({ k: "roll", roll: roll({ type: "TRAP_ESCAPE", roller: "US", card_id: 11, roll1: 4, mod2: 4, total1: 4, total2: 4, success: true }) });
    },
  },
  // ── DEFCON 2 ──
  {
    id: "danger", group: "DEFCON", label: "DEFCON 3 → 2 (frame)",
    async run({ play }) { await play({ k: "track", event: { t: "defcon", from: 3, to: 2 } }); },
  },
  // ── Endings ──
  ...([
    ["over-vp20", "VP 20", ending("vp20", "US", 20, { vpBefore: 18, turn: 5 })],
    ["over-held", "Held scoring", ending("held-scoring", "USSR", -20, { vpBefore: 1, cards: [79] })],
    ["over-draw", "Held scoring · draw", ending("held-scoring-both", "DRAW", 3, { vpBefore: 3, cards: [1, 2], turn: 6 })],
    ["over-defcon", "DEFCON 1", ending("defcon", "US", 20, { vpBefore: -6, turn: 4 })],
    ["over-europe", "Europe control", ending("europe-control", "USSR", -20, { vpBefore: -4, turn: 6 })],
    ["over-final", "Final scoring", ending("final-scoring", "USSR", -7, { vpBefore: -3, turn: 10 })],
    ["over-wargames", "Wargames", ending("wargames", "US", 4, { vpBefore: 10, turn: 8 })],
    ["over-resign", "Resign", ending("resign", "USSR", 1, { turn: 2 })],
  ] as const).map(([id, label, e]): Moment => ({
    id, group: "Game over", label,
    async run({ play, setEnding, wait }) {
      setEnding(e);
      await wait(80);
      await play({ k: "game-over", ending: e });
    },
  })),
];

function useMomentRunner() {
  const root = useUiRoot();
  const vm = useVm();
  const shown = useShown();
  const store = useStageStore();
  const abort = useRef<AbortController | null>(null);
  const latest = useRef({ root, vm, shown });
  latest.current = { root, vm, shown };
  const run = async (m: Moment, onEnding: (e: Ending | null) => void) => {
    abort.current?.abort();
    store.reset();
    const ac = new AbortController();
    abort.current = ac;
    const { root: r, vm: v, shown: sh } = latest.current;
    const state = sh.state;
    if (!state || !v.humanSide) return;
    const human = v.humanSide, ai: Side = human === "US" ? "USSR" : "US";
    const api: MomentApi = {
      state, human, ai, setEnding: onEnding,
      wait: ms => new Promise(res => setTimeout(res, ms)),
      async play(beat, events = [], patch) {
        if (ac.signal.aborted) return;
        const cur = latest.current.shown.state ?? state;
        const frame: Frame = {
          seq: -1, state: { ...cur, ...patch, card_locations: { ...cur.card_locations, ...(patch?.card_locations ?? {}) } } as PublicState,
          regionScores: latest.current.shown.regionScores ?? { regions: [], ignored_flags: [] }, actor: ai, events: [...events], auto: false,
        };
        if (beat.k === "scoring") {
          const card = beat.card;
          beat = { ...beat, scores: frame.regionScores, vp: frame.regionScores.regions.find(x => x.slot === slotOf(card))?.net ?? 0 };
        }
        const sp = frameSpeed({ speed: r.settings.speed, auto: false, byHuman: false, queued: 0 });
        const ctx: BeatContext = { frame, before: cur, humanSide: human, speed: { motion: sp.motion, hold: sp.hold * HOLD }, signal: ac.signal, settings: r.settings };
        await r.director.run(beat, ctx);
      },
    };
    await m.run(api);
  };
  return { run, stop: () => { abort.current?.abort(); store.reset(); } };
}

const slotOf = (card: number): number => ({ 2: 0, 1: 1, 3: 2, 79: 3, 37: 4, 81: 5, 38: 6 } as Record<number, number>)[card] ?? -1;

function MockConsole() {
  const root = useUiRoot();
  const shown = useShown();
  const st = shown.state;
  return (
    <header className={s.console}>
      <b className={s.brand}>Stage demo</b>
      <span ref={root.anchors.ref("turn")}>T{st?.turn ?? "–"}</span>
      <span ref={root.anchors.ref("ar")}>AR{st?.action_round ?? "–"}</span>
      <span ref={root.anchors.ref("defcon")}>DEFCON {st?.defcon ?? "–"}</span>
      <span ref={root.anchors.ref("vp")}>VP {st?.victory_points ?? "–"}</span>
      <span className={s.space} ref={root.anchors.ref("space:US")}>US space {st?.space.US ?? 0}</span>
      <span className={s.space} ref={root.anchors.ref("space:USSR")}>USSR space {st?.space.USSR ?? 0}</span>
    </header>
  );
}

function MockTray() {
  const root = useUiRoot();
  const shown = useShown();
  const vm = useVm();
  const { waiting, proceed } = useStageWaiting();
  const st = shown.state;
  if (!st || !vm.humanSide) return null;
  const human = vm.humanSide;
  const ai = human === "US" ? "USSR" : "US";
  const topDiscard = st.discard_pile[st.discard_pile.length - 1];
  const topRemoved = st.removed_pile[st.removed_pile.length - 1];
  return (
    <div className={s.tray}>
      <div className={s.slip}>
        {waiting ? <Button variant="primary" onPaper kbd="⎵" onClick={proceed}>Continue (slip)</Button>
          : shown.busy ? <Button variant="ghost" onPaper onClick={() => shown.skip()}>Skip</Button>
            : <span>{vm.prompt ? vm.prompt.kind : vm.ending ? "game over" : "—"}</span>}
      </div>
      <div className={s.hand} ref={root.anchors.ref(`hand:${human}`)}>
        {st.hands[human].slice(0, 7).map(c => <div key={c} ref={root.anchors.ref(`card:${c}`)}><CardFace card={c} width={52} /></div>)}
      </div>
      <div className={s.pile} ref={root.anchors.ref("deck")}><CardBack width={44} label="" /><b>{st.draw_deck_count}</b></div>
      <div className={s.pile} ref={root.anchors.ref("discard")}>{topDiscard ? <CardFace card={topDiscard} width={44} /> : <span>∅</span>}</div>
      <div className={s.pile} ref={root.anchors.ref("removed")}>{topRemoved ? <CardFace card={topRemoved} width={44} /> : <span>∅</span>}</div>
      <div className={s.slot} ref={root.anchors.ref("effects")}>fx {st.flags.length}</div>
      <div className={s.aiHand} ref={root.anchors.ref(`hand:${ai}`)}><CardBack width={40} label="" /><b>{st.aiHandCount}</b></div>
    </div>
  );
}

function StageDemo() {
  const root = useUiRoot();
  const vm = useVm();
  const shown = useShown();
  const { fixture } = useDemo();
  const map = useRef<MapHandle>(null);
  useMapBeats(map, root.director, { layout: root.layout });
  useOnCommit(() => map.current?.clearOverrides());
  const [focus, setFocus] = useState<RegionSlot | null>(null);
  const [synthetic, setSynthetic] = useState<Ending | null>(null);
  const [telexKey, setTelexKey] = useState(0);
  const moments = useMomentRunner();
  const compact = root.layout === "compact" || root.layout === "compact-landscape";
  const onEnding = (e: Ending | null) => { setSynthetic(e); setTelexKey(k => k + 1); };
  const shownEnding = synthetic ?? vm.ending;

  const auto = q.get("moment");
  const started = useRef(false);
  useEffect(() => {
    if (!auto || started.current || !shown.state || shown.busy) return;
    const m = MOMENTS.find(x => x.id === auto);
    if (!m) return;
    const t = setTimeout(() => {
      if (started.current) return;
      started.current = true;
      void moments.run(m, onEnding);
    }, 700);
    return () => clearTimeout(t);
  }, [auto, shown.state, shown.busy]);

  const groups = useMemo(() => [...new Set(MOMENTS.map(m => m.group))], []);
  return (
    <div className={`${s.demo} ${compact ? s.compact : ""} ${CHROME ? "" : s.bare}`} data-human={vm.humanSide ?? undefined}>
      <MockConsole />
      <main className={s.table} aria-busy={shown.busy} onClick={() => { if (shown.busy) shown.skip(); }}>
        <MapView
          ref={map} state={shown.state} regionScores={shown.regionScores} humanSide={vm.humanSide ?? "USSR"} layout={root.layout}
          targets={null} regionTargets={null} selection={null} placed={shown.placedThisPlay} lastOpponent={shown.lastOpponent}
          focusRegion={focus} interactive={!shown.busy} labelScale={root.settings.mapLabels / 100} patterns={root.settings.patterns}
          anchors={root.anchors} insets={{ bottom: compact ? 76 : 110 }} insetOverlap={compact ? 0 : 48}
        />
        <Stage onFocusRegion={setFocus} />
        <MockTray />
        <Toaster />
      </main>
      {CHROME ? (
        <aside className={s.panel}>
          <DemoToolbar inline />
          <h1 className={s.title}>{fixture.name}</h1>
          <p className={s.desc}>{fixture.description}</p>
          {groups.map(g => (
            <section key={g} className={s.group}>
              <h2>{g}</h2>
              <div className={s.buttons}>
                {MOMENTS.filter(m => m.group === g).map(m => (
                  <button key={m.id} type="button" data-moment={m.id} onClick={() => void moments.run(m, onEnding)}>{m.label}</button>
                ))}
              </div>
            </section>
          ))}
          <div className={s.buttons}>
            <button type="button" onClick={() => { moments.stop(); setSynthetic(null); }}>Clear stage</button>
          </div>
        </aside>
      ) : null}
      {shownEnding && vm.humanSide ? (
        <GameOverTelex
          key={telexKey}
          ending={shownEnding}
          humanSide={vm.humanSide}
          onNewGame={() => { setSynthetic(null); }}
          onReview={() => undefined}
          onLog={() => undefined}
          stats={synthetic ? { playingMs: 47 * 60000, ai: { decisions: 212, ms: 6 * 60000 } } : undefined}
        />
      ) : null}
      <DangerFrame />
      <FlightLayer />
    </div>
  );
}

function Loading(): ReactNode {
  return <p className={s.loading}>Loading fixture…</p>;
}

void bootDemo(() => (
  <DemoHarness scene="prompt-midgame" loading={<Loading />}>
    <StageDemo />
  </DemoHarness>
));
