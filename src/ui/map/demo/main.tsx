/**
 * Map demo (dev only; not a production build input). Run `npx vite` and open
 * http://localhost:5173/TS_playfield/src/ui/map/demo/index.html?scene=influence&lang=en
 *
 * Scenes: influence (USSR places Ops, quiet rings, cost tags, pencil marks, AI delta pills), coup (US
 * coup targets, loud rings, reticle, danger), region (Chernobyl region prompt), setup (USSR setup in
 * Eastern Europe), idle (no prompt), empty (no state). `view=desktop|compact` (default: by width).
 */
import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "../../theme/fonts.css";
import "../../theme/tokens.css";
import "../../theme/base.css";
import { initLanguage, setLanguage } from "../../../i18n";
import { useI18n } from "../../../i18n/react";
import type { PublicState, Side } from "../../../game/contract";
import type { RegionScores } from "../../../engine/types";
import { COUNTRIES } from "../../../data";
import { layoutFor, type LayoutKind } from "../../theme";
import { MapView } from "../MapView";
import type { CountryBeat, MapHandle, MapTargets, RegionSlot } from "../contract";
import { BOARD_ORDER } from "../layout";
import { influenceTargets, MIDGAME, OPENING, sampleScores, sampleState, scoresWith, targetsOf } from "./samples";
import "./demo.css";

type Scene = "influence" | "coup" | "region" | "setup" | "idle" | "empty";
const SCENES: Scene[] = ["influence", "coup", "region", "setup", "idle", "empty"];
const q = new URLSearchParams(location.search);

interface SceneProps {
  human: Side;
  state: PublicState | null;
  scores: RegionScores | null;
  targets: MapTargets | null;
  selection: number | null;
  placed: Record<number, number>;
  lastOpponent: Record<number, { us: number; ussr: number }>;
  regionTargets: ReadonlySet<RegionSlot> | null;
}

function sceneProps(scene: Scene): SceneProps {
  const scores = sampleScores();
  if (scene === "coup") {
    const human: Side = "US";
    const ids = [24, 25, 29, 30, 22, 54, 57, 31, 43, 71];
    return {
      human, state: sampleState(MIDGAME, human), scores: scoresWith(scores, 0, { wins: null }),
      targets: targetsOf(ids, { verb: "coup", danger: new Set([24]) }), selection: 25,
      placed: {}, lastOpponent: { 14: { us: 0, ussr: 1 }, 7: { us: -1, ussr: 1 } }, regionTargets: null,
    };
  }
  if (scene === "region") {
    const human: Side = "US";
    return {
      human, state: sampleState(MIDGAME, human), scores, targets: null, selection: null, placed: {}, lastOpponent: {},
      regionTargets: new Set<RegionSlot>([0, 1, 2, 3, 4, 5]),
    };
  }
  if (scene === "setup") {
    const human: Side = "USSR";
    const ids = COUNTRIES.filter(c => c.subregions.includes("EASTERN_EUROPE")).map(c => c.id);
    return {
      human, state: sampleState(OPENING, human), scores: scoresWith(scores, 0, { net: -3, wins: null }),
      targets: targetsOf(ids, { verb: "add" }), selection: null, placed: { 15: 1, 14: 2 }, lastOpponent: {}, regionTargets: null,
    };
  }
  const human: Side = "USSR";
  const state = scene === "empty" ? null : sampleState(MIDGAME, human);
  if (scene !== "influence") {
    return { human, state, scores: scene === "empty" ? null : scores, targets: null, selection: null, placed: {}, lastOpponent: {}, regionTargets: null };
  }
  const ids = influenceTargets(MIDGAME, "USSR");
  const cost2 = new Set(ids.filter(id => {
    const [us, ussr] = MIDGAME[id] ?? [0, 0];
    const st = COUNTRIES[id]!.stability;
    return us >= st && us - ussr >= st;
  }));
  return {
    human, state, scores, targets: targetsOf(ids, { verb: "add", cost2 }), selection: null,
    placed: { 24: 1, 26: 1 }, lastOpponent: { 53: { us: 1, ussr: 0 }, 63: { us: 1, ussr: 0 }, 39: { us: 1, ussr: 0 }, 40: { us: 1, ussr: 0 } },
    regionTargets: null,
  };
}

function useViewport() {
  const [vp, setVp] = useState({ w: innerWidth, h: innerHeight });
  useEffect(() => {
    const on = () => setVp({ w: innerWidth, h: innerHeight });
    addEventListener("resize", on);
    return () => removeEventListener("resize", on);
  }, []);
  return vp;
}

function Demo() {
  const { lang, setLang } = useI18n();
  const [scene, setScene] = useState<Scene>((SCENES as string[]).includes(q.get("scene") ?? "") ? (q.get("scene") as Scene) : "influence");
  const [patterns, setPatterns] = useState(q.get("patterns") === "on");
  const [labels, setLabels] = useState(Number(q.get("labels") ?? 100) / 100);
  const [log, setLog] = useState("");
  const [focusRegion, setFocusRegion] = useState<RegionSlot | null>(null);
  const vp = useViewport();
  const layout: LayoutKind = (q.get("view") as LayoutKind | null) ?? layoutFor(vp.w, vp.h);
  const compact = layout === "compact" || layout === "compact-landscape";
  const map = useRef<MapHandle>(null);
  const sp = useMemo(() => sceneProps(scene), [scene]);
  const [state, setState] = useState(sp.state);
  useEffect(() => setState(sp.state), [sp]);
  const targets: MapTargets | null = sp.targets;
  const trayH = compact ? 0 : Math.round(Math.min(184, Math.max(152, vp.h * 0.185)));

  const playBeat = async () => {
    if (!map.current || !state) return;
    const id = 26; // Jordan: +1 USSR takes control
    const c = Object.values(state.countries).find(x => x.id === id)!;
    const beat: CountryBeat = {
      k: "country", country: id,
      influence: [{ side: "USSR", from: c.ussr_influence, to: c.ussr_influence + 1 }],
      control: c.ussr_influence + 1 >= c.stability && c.controlled_by !== "USSR" ? { from: c.controlled_by, to: "USSR" } : undefined,
    };
    const ctrl = new AbortController();
    await map.current.playCountry(beat, { motion: 1, hold: 1 }, ctrl.signal);
    // Commit the new state, then drop the override (what the runner does).
    const next = structuredClone(state);
    const n = Object.values(next.countries).find(x => x.id === id)!;
    n.ussr_influence = beat.influence[0]!.to;
    if (beat.control) n.controlled_by = beat.control.to;
    setState(next);
    map.current.clearOverrides();
  };

  return (
    <div className={`demo ${compact ? "demo-compact" : "demo-desktop"}`} data-human={sp.human}>
      <header className="demo-console">
        <b className="demo-word">MAP DEMO</b>
        {SCENES.map(s => (
          <button key={s} type="button" aria-pressed={s === scene} onClick={() => setScene(s)}>{s}</button>
        ))}
        <span className="demo-sep" />
        <button type="button" onClick={() => void setLang(lang === "zh-CN" ? "en" : "zh-CN")}>{lang === "zh-CN" ? "EN" : "中文"}</button>
        <button type="button" aria-pressed={patterns} onClick={() => setPatterns(p => !p)}>patterns</button>
        <button type="button" onClick={() => setLabels(l => (l >= 1.3 ? 1 : l >= 1.15 ? 1.3 : 1.15))}>labels {Math.round(labels * 100)}%</button>
        <button type="button" onClick={() => void playBeat()}>beat</button>
        <button type="button" onClick={() => map.current?.pulse(7)}>pulse</button>
        <button type="button" onClick={() => setFocusRegion(r => (r === null ? 2 : null))}>focus ME</button>
        {BOARD_ORDER.map((slot, i) => (
          <button key={slot} type="button" onClick={() => void map.current?.frameRegion(slot, { animate: true })}>{i + 1}</button>
        ))}
        <button type="button" onClick={() => void map.current?.frame("world", { animate: true })}>world</button>
        <span className="demo-log">{log}</span>
      </header>
      {compact && <div className="demo-theatre">theatre bar</div>}
      <main className="demo-table">
        <div className="demo-mapframe">
          <MapView
            ref={map}
            state={state}
            regionScores={sp.scores}
            humanSide={sp.human}
            layout={layout}
            targets={targets}
            regionTargets={sp.regionTargets}
            selection={sp.selection}
            placed={sp.placed}
            lastOpponent={sp.lastOpponent}
            focusRegion={focusRegion}
            interactive
            labelScale={labels}
            patterns={patterns}
            insets={compact ? undefined : { bottom: trayH - 10 }}
            insetOverlap={compact ? 0 : 64}
            onActivate={id => setLog(`activate ${COUNTRIES[id]?.name.en}`)}
            onInspect={id => setLog(`inspect ${COUNTRIES[id]?.name.en}`)}
            onRegionActivate={slot => setLog(`region ${slot}`)}
          />
        </div>
        {!compact && <div className="demo-tray" style={{ height: trayH }}>tray (slip · hand · China · piles)</div>}
      </main>
      {!compact && <aside className="demo-rail">rail</aside>}
      {compact && <div className="demo-sheet">orders slip</div>}
      {compact && <nav className="demo-dock">dock</nav>}
    </div>
  );
}

await initLanguage();
if (q.get("lang") === "zh") await setLanguage("zh-CN");
createRoot(document.getElementById("root")!).render(<StrictMode><Demo /></StrictMode>);
