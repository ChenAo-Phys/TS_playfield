/**
 * Runner demo (dev only; not a production build input): replays a recorded fixture through the real
 * frame runner, with the real map (country beats), the flight layer over mock piles / hands, a beat
 * log, speed / motion controls, Skip and Skip to my turn. Clicking the table while it animates skips.
 *
 *   TSP_VITE_CACHE=node_modules/.vite-5182 npx vite --port 5182 --strictPort
 *   http://localhost:5182/TS_playfield/src/ui/runner/demo/index.html?scene=seq-ai-turn&lang=en
 *
 * Parameters: those of DemoHarness (scene, lang, speed, motion, view, queued, think, start…).
 */
import { useEffect, useRef, useState } from "react";
import { bootDemo, DemoHarness, DemoToolbar, useDemo } from "../../../dev/DemoHarness";
import { useI18n } from "../../../i18n/react";
import { CardBack } from "../../cards/CardBack";
import { CardFace } from "../../cards/CardFace";
import { Toaster } from "../../common/Toaster";
import { MapView, useMapBeats, type MapHandle } from "../../map";
import { useUiRoot, useVm } from "../../state/context";
import type { Beat } from "../../ui-contract";
import type { BeatRecord, RunnerDirector } from "../director";
import { FlightLayer } from "../FlightLayer";
import { useOnCommit, useShown } from "../ShownContext";
import s from "./demo.module.css";

interface LogRow { id: number; seq: number; text: string; phase: "start" | "end"; t: number; handlers: number; aborted: boolean }

function describe(b: Beat, cardName: (id: number) => string, countryName: (id: number) => string): string {
  switch (b.k) {
    case "reveal": return `reveal ${b.side} ${cardName(b.card)} (${b.how}${b.byHuman ? ", you" : ""})`;
    case "headline-chosen": return `headline chosen ${b.side}`;
    case "headline-reveal": return `headline reveal ${cardName(b.us)} / ${cardName(b.ussr)} · ${b.first} first`;
    case "roll": return `roll ${b.roll.type} ${b.roll.roll1 ?? ""}${b.roll.roll2 ? `/${b.roll.roll2}` : ""}${b.roll.country_name ? ` · ${b.roll.country_name}` : ""}`;
    case "scoring": return `scoring ${cardName(b.card)} ${b.vp >= 0 ? "+" : ""}${b.vp}`;
    case "country": return `country ${countryName(b.country)} ${b.influence.map(i => `${i.side} ${i.from}→${i.to}`).join(", ")}${b.control ? ` · ${b.control.from}→${b.control.to}` : ""}`;
    case "track": return `track ${b.event.t} ${"from" in b.event ? `${b.event.from}→${b.event.to}` : `${b.event.ar} ${b.event.side}`}`;
    case "effect": return `effect ${b.on ? "on" : "off"} ${b.flag}`;
    case "reshuffle": return "reshuffle";
    case "deal": return `deal ${b.side} ×${b.count}`;
    case "hand-revealed": return `hand revealed ${b.side} ${b.cards.map(cardName).join(", ")}`;
    case "card-moved": return `card ${cardName(b.card)} ${b.from} → ${b.to}`;
    case "china": return `China → ${b.holder}${b.playable ? "" : " (face down)"}`;
    case "banner": return `banner ${b.kind} ${b.turn ?? b.phase ?? ""}`;
    case "game-over": return `game over ${b.ending.reason} · ${b.ending.winner}`;
  }
}

function BeatLog() {
  const root = useUiRoot();
  const { cardName, countryName } = useI18n();
  const [rows, setRows] = useState<LogRow[]>([]);
  const next = useRef(1);
  const t0 = useRef(performance.now());
  useEffect(() => {
    const d = root.director as RunnerDirector;
    return d.observe((r: BeatRecord) => {
      const row: LogRow = {
        id: next.current++, seq: 0, text: describe(r.beat, cardName, countryName), phase: r.phase,
        t: Math.round(performance.now() - t0.current), handlers: r.handlers, aborted: r.aborted,
      };
      setRows(list => [...list.slice(-300), row]);
    });
  }, [root.director, cardName, countryName]);
  const box = useRef<HTMLOListElement>(null);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [rows]);
  return (
    <ol ref={box} className={s.log}>
      {rows.filter(r => r.phase === "start").map(r => {
        const end = rows.find(x => x.phase === "end" && x.text === r.text && x.id > r.id);
        return (
          <li key={r.id} data-handlers={r.handlers} data-aborted={end?.aborted || undefined}>
            <span className={s.t}>{r.t}</span> {r.text}
            <span className={s.meta}>{` ×${r.handlers}${end ? ` ${end.t - r.t} ms` : " …"}`}</span>
          </li>
        );
      })}
    </ol>
  );
}

function MockTray() {
  const root = useUiRoot();
  const shown = useShown();
  const vm = useVm();
  const st = shown.state;
  if (!st || !vm.humanSide) return null;
  const human = vm.humanSide;
  const ai = human === "US" ? "USSR" : "US";
  const topDiscard = st.discard_pile[st.discard_pile.length - 1];
  const topRemoved = st.removed_pile[st.removed_pile.length - 1];
  const hl = (side: "US" | "USSR") => (side === "US" ? st.headline_us_card : st.headline_ussr_card);
  return (
    <div className={s.tray}>
      <div className={s.hand} ref={root.anchors.ref(`hand:${human}`)}>
        {st.hands[human].map(c => (
          <div key={c} ref={root.anchors.ref(`card:${c}`)} className={s.handCard}><CardFace card={c} width={46} /></div>
        ))}
      </div>
      <div className={s.slot} ref={root.anchors.ref(`headline:${human}`)}>{hl(human) ? <CardFace card={hl(human)} width={34} /> : <span>HL</span>}</div>
      <div className={s.pile} ref={root.anchors.ref("deck")}><CardBack width={40} label="" /><b>{st.draw_deck_count}</b></div>
      <div className={s.pile} ref={root.anchors.ref("discard")}>{topDiscard ? <CardFace card={topDiscard} width={40} /> : <span>∅</span>}<b>{st.discard_pile.length}</b></div>
      <div className={s.pile} ref={root.anchors.ref("removed")}>{topRemoved ? <CardFace card={topRemoved} width={40} /> : <span>∅</span>}<b>{st.removed_pile.length}</b></div>
      <div className={s.effects} ref={root.anchors.ref("effects")}>{st.flags.length} fx</div>
      <div className={s.slot} ref={root.anchors.ref(`headline:${ai}`)}>{hl(ai) ? <CardFace card={hl(ai)} width={34} /> : <span>HL</span>}</div>
      <div className={s.aiHand} ref={root.anchors.ref(`hand:${ai}`)}>
        <CardBack width={34} label="" /><b>{st.aiHandCount}</b>
        {st.aiKnownCards.map(c => <CardFace key={c} card={c} width={26} />)}
      </div>
    </div>
  );
}

function RunnerDemo() {
  const root = useUiRoot();
  const vm = useVm();
  const shown = useShown();
  const { fixture } = useDemo();
  const { cardName, countryName } = useI18n();
  const map = useRef<MapHandle>(null);
  useMapBeats(map, root.director, { layout: root.layout });
  useOnCommit(() => map.current?.clearOverrides());
  const compact = root.layout === "compact" || root.layout === "compact-landscape";
  const pills = Object.entries(shown.lastOpponent).map(([c, d]) => `${countryName(Number(c))} ${d.us ? `US ${d.us > 0 ? "+" : ""}${d.us}` : ""}${d.ussr ? ` USSR ${d.ussr > 0 ? "+" : ""}${d.ussr}` : ""}`);
  const marks = Object.entries(shown.placedThisPlay).map(([c, n]) => `${countryName(Number(c))} ${n}`);
  return (
    <div className={`${s.demo} ${compact ? s.compact : ""}`} data-human={vm.humanSide ?? undefined}>
      <main className={s.table} aria-busy={shown.busy} onClickCapture={e => { if (shown.busy) { e.stopPropagation(); shown.skip(); } }}>
        <MapView
          ref={map} state={shown.state} regionScores={shown.regionScores} humanSide={vm.humanSide ?? "USSR"} layout={root.layout}
          targets={null} regionTargets={null} selection={null} placed={shown.placedThisPlay} lastOpponent={shown.lastOpponent}
          focusRegion={null} interactive={!shown.busy} labelScale={root.settings.mapLabels / 100} patterns={root.settings.patterns}
          anchors={root.anchors} insets={{ bottom: compact ? 0 : 96 }} insetOverlap={compact ? 0 : 48}
        />
        <div className={s.stage} ref={root.anchors.ref("stage")} />
        {shown.aiPlayCard > 0 && (
          <div className={s.dock}><CardFace card={shown.aiPlayCard} width={compact ? 64 : 96} /><span>{cardName(shown.aiPlayCard)}</span></div>
        )}
        <MockTray />
        <Toaster />
      </main>
      <aside className={s.panel}>
        <DemoToolbar inline />
        <h1 className={s.title}>{fixture.name}</h1>
        <p className={s.desc}>{fixture.description}</p>
        <div className={s.controls}>
          <button type="button" onClick={() => shown.skip()} disabled={!shown.busy}>Skip</button>
          <button type="button" onClick={() => shown.skipToMyTurn()} disabled={!!vm.prompt || vm.status !== "playing"}>Skip to my turn</button>
          <span className={s.hint}>Shift = boost</span>
        </div>
        <dl className={s.facts}>
          <dt>busy</dt><dd data-on={shown.busy || undefined}>{String(shown.busy)}{shown.actor ? ` · ${shown.actor}` : ""}</dd>
          <dt>frame</dt><dd>{vm.frame ? `#${vm.frame.seq}${vm.frame.playId !== undefined ? ` · play ${vm.frame.playId}` : ""}${vm.frame.auto ? " · auto" : ""}` : "—"}</dd>
          <dt>shown</dt><dd>{shown.state ? `T${shown.state.turn} AR${shown.state.action_round} · DEFCON ${shown.state.defcon} · VP ${shown.state.victory_points}` : "—"}</dd>
          <dt>prompt</dt><dd>{vm.prompt ? vm.prompt.kind : vm.ending ? `over: ${vm.ending.reason}` : vm.aiThinking ? "AI thinking" : "—"}</dd>
          <dt>dock</dt><dd>{shown.aiPlayCard ? cardName(shown.aiPlayCard) : "—"}</dd>
          <dt>pills</dt><dd>{pills.join(" · ") || "—"}</dd>
          <dt>marks</dt><dd>{marks.join(" · ") || "—"}</dd>
        </dl>
        <BeatLog />
      </aside>
      <FlightLayer />
    </div>
  );
}

void bootDemo(() => (
  <DemoHarness scene="seq-ai-turn">
    <RunnerDemo />
  </DemoHarness>
));
