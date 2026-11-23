/**
 * Tray demo (dev only; not a production build input): the real Tray / HandDrawer on recorded fixtures,
 * inside a stand-in game grid (real map, empty console and rail, a stub orders slip). Card clicks go
 * through a tiny local stand-in for the prompt layer's policy (instant / stage), so staging and the
 * FixtureController's recorded `choose` calls can be tried.
 *
 *   TSP_VITE_CACHE=node_modules/.vite-5188 npx vite --port 5188 --strictPort
 *   http://localhost:5188/TS_playfield/src/ui/tray/demo/index.html?scene=prompt-action-card-china&lang=en
 *
 * Parameters (besides DemoHarness's scene, lang, view, speed, motion, start…):
 *   staged=<card>      start with that card staged
 *   drop=25,26         leave these cards out of the offered options (shows unplayable cards)
 *   variant=committed  your headline committed face down (from seq-headline)
 *   variant=neutral    no prompt, nothing animating (from prompt-action-card)
 *   drawer=closed      compact: start with the hand drawer closed
 *   shot=1             hide the dev toolbar (screenshots)
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { bootDemo, DemoHarness, DemoToolbar, useDemo } from "../../../dev/DemoHarness";
import type { Fixture } from "../../../dev/fixtureFormat";
import { loadFixture } from "../../../dev/fixtures";
import { cardInfo } from "../../../data";
import type { Prompt, PublicState } from "../../../game/contract";
import { useI18n } from "../../../i18n/react";
import { CardBack } from "../../cards/CardBack";
import { CardFace } from "../../cards/CardFace";
import { CardZoomHost } from "../../cards/CardZoom";
import { Button } from "../../common/Button";
import { KeymapProvider, useKey } from "../../common/keymap";
import { MessageText } from "../../common/MessageText";
import { Stamp } from "../../common/Stamp";
import { Toaster } from "../../common/Toaster";
import { MapView, useMapBeats, type MapHandle } from "../../map";
import { FlightLayer } from "../../runner/FlightLayer";
import { useOnCommit, useShown } from "../../runner/ShownContext";
import { useUiRoot } from "../../state/context";
import { trayHeight } from "../../theme";
import type { OptionPolicy } from "../../ui-contract";
import { HandDrawer, isHandPrompt, Piles, Tray, TrayBeatsProvider } from "..";
import s from "./demo.module.css";

const q = new URLSearchParams(location.search);
const STAGED = Number(q.get("staged")) || null;
const DROP = new Set((q.get("drop") ?? "").split(",").map(Number).filter(Boolean));
const VARIANT = q.get("variant");
const SHOT = q.get("shot") === "1";

/** A stand-in for the prompt layer's policy: stage headlines, scoring cards and warned cards. */
function demoOffered(prompt: Prompt | null): Map<number, OptionPolicy> {
  const m = new Map<number, OptionPolicy>();
  if (!prompt) return m;
  for (const option of prompt.options) {
    if (option.kind !== "card" || DROP.has(option.id)) continue;
    const warned = option.warnings?.some(w => w.code === "scoring-stranded");
    const stage = prompt.kind === "headline" || prompt.kind === "event-card" || warned || !!cardInfo(option.id)?.scoring;
    m.set(option.id, { option, commit: stage ? "stage" : "instant", severity: warned ? "caution" : option.warnings?.length ? "info" : "none" });
  }
  return m;
}

/** A stub orders slip (the real one is src/ui/prompts OrdersSlip). */
function StubSlip({ prompt, state, staged, onConfirm }: { prompt: Prompt | null; state: PublicState | null; staged: number | null; onConfirm(): void }) {
  const { t, cardName } = useI18n();
  const root = useUiRoot();
  const human = root.vm.humanSide;
  const ai = human === "US" ? "USSR" : "US";
  const head = !state ? "" : prompt?.kind === "headline" || state.current_phase_name === "HEADLINE" ? t("ui:slip.ordersHeadline", { turn: state.turn }) : t("ui:slip.orders", { turn: state.turn, ar: state.action_round });
  return (
    <div className={s.slip} ref={root.anchors.ref("slip")}>
      <div className={s.slipHead}>
        <span>{head}</span>
        {prompt ? <Stamp side={human} animate={false}>{t("ui:slip.stamp.you")}</Stamp> : <Stamp side={ai} animate={false}>{t("ui:slip.stamp.ai", { side: t(ai === "US" ? "ui:side.US" : "ui:side.USSR") })}</Stamp>}
      </div>
      <div className={s.slipTitle}>
        {prompt ? <MessageText message={prompt.title} /> : t("ui:slip.ai.waiting", { side: t(ai === "US" ? "ui:side.long.US" : "ui:side.long.USSR") })}
      </div>
      {prompt?.detail ? <div className={s.slipHint}><MessageText message={prompt.detail} /></div> : null}
      {prompt?.kind === "headline" && !staged ? <div className={s.slipHint}>{t("ui:slip.hint.headline")}</div> : null}
      {staged ? (
        <div className={s.slipActions}>
          <Button variant="primary" size="s" onPaper kbd="↵" onClick={onConfirm}>
            {prompt?.kind === "headline" ? t("ui:slip.confirm.headline") : t("ui:slip.confirm.play", { card: cardName(staged) })}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function TrayDemo() {
  const root = useUiRoot();
  const vm = root.vm;
  const shown = useShown();
  const { fixture } = useDemo();
  const { t, cardName } = useI18n();
  const map = useRef<MapHandle>(null);
  useMapBeats(map, root.director, { layout: root.layout });
  useOnCommit(() => map.current?.clearOverrides());
  const prompt = vm.prompt;
  const offered = useMemo(() => demoOffered(prompt), [prompt]);
  const [staged, setStaged] = useState<number | null>(STAGED);
  const firstPrompt = useRef(prompt?.promptId);
  useEffect(() => { if (prompt?.promptId !== firstPrompt.current) setStaged(null); }, [prompt?.promptId]);
  const [log, setLog] = useState<string[]>([]);
  const choose = (card: number) => {
    const p = offered.get(card);
    if (!p || !prompt) return;
    root.controller.choose(prompt.promptId, p.option.idx);
    setLog(l => [...l.slice(-4), `choose #${card} (idx ${p.option.idx})`]);
    setStaged(null);
  };
  const activate = (card: number) => {
    const p = offered.get(card);
    if (!p) return;
    if (p.commit === "instant" || staged === card) choose(card);
    else setStaged(card);
  };
  useKey("Escape", () => (staged !== null ? setStaged(null) : false));
  useKey("Enter", () => (staged !== null ? choose(staged) : false));

  const layout = root.layout;
  const compact = layout === "compact" || layout === "compact-landscape";
  const hand = shown.state && vm.humanSide ? shown.state.hands[vm.humanSide] : [];
  const [drawer, setDrawer] = useState(q.get("drawer") !== "closed" && isHandPrompt(prompt, hand));
  useEffect(() => { if (compact) setDrawer(isHandPrompt(prompt, hand) && q.get("drawer") !== "closed"); }, [prompt?.promptId]);

  const slip = <StubSlip prompt={prompt} state={shown.state} staged={staged} onConfirm={() => staged !== null && choose(staged)} />;
  const bottom = compact ? 0 : trayHeight(typeof innerHeight === "number" ? innerHeight : 900, layout);
  const st = shown.state;
  const ai = vm.humanSide === "US" ? "USSR" : "US";
  return (
    <div className={`${s.game} ${s[layout] ?? ""}`} data-human={vm.humanSide ?? undefined}>
      <header className={s.console} />
      <main className={s.table} aria-busy={shown.busy} onClickCapture={e => { if (shown.busy) { e.stopPropagation(); shown.skip(); } }}>
        <MapView
          ref={map} state={st} regionScores={shown.regionScores} humanSide={vm.humanSide ?? "USSR"} layout={layout}
          targets={null} regionTargets={null} selection={null} placed={shown.placedThisPlay} lastOpponent={shown.lastOpponent}
          focusRegion={null} interactive={!shown.busy} labelScale={root.settings.mapLabels / 100} patterns={root.settings.patterns}
          anchors={root.anchors} insets={{ bottom }} insetOverlap={compact ? 0 : layout === "tablet" ? 48 : 64}
        />
        <div className={s.stage} ref={root.anchors.ref("stage")} />
        <Toaster />
      </main>
      {compact ? null : (
        <aside className={s.rail}>
          {SHOT ? null : <DemoToolbar inline />}
          {SHOT ? null : <p className={s.dev}>{fixture.name}: {fixture.description}</p>}
          {SHOT ? null : <ol className={s.dev}>{log.map((l, i) => <li key={i}>{l}</li>)}</ol>}
          {st ? (
            <div className={s.adversary}>
              <span ref={root.anchors.ref(`hand:${ai}`)}><CardBack width={40} label="" /></span>
              {st.china_card.holder === ai ? <span ref={root.anchors.ref(`china:${ai}`)}><CardFace card={6} width={40} /></span> : null}
              <span ref={root.anchors.ref("effects")} className={s.effects} />
            </div>
          ) : null}
        </aside>
      )}
      {compact ? (
        <>
          <div className={s.sheet}>{slip}</div>
          <nav className={s.dock}>
            <button type="button" className={s.dockHand} onClick={() => setDrawer(true)} ref={root.anchors.ref(`hand:${vm.humanSide ?? "US"}`)}>
              <span className={s.thumbs}>{hand.slice(0, 3).map(c => <CardFace key={c} card={c} width={26} className={s.thumb} />)}</span>
              {t("ui_tray:drawer.title", { count: hand.length })}
            </button>
            {st ? <div className={s.dockPiles}><Piles deck={st.draw_deck_count} discard={st.discard_pile} removed={st.removed_pile} onOpen={p => setLog(l => [...l, `open ${p}`])} variant="panel" /></div> : null}
          </nav>
          <HandDrawer open={drawer} onClose={() => setDrawer(false)} offered={offered} staged={staged} onActivateCard={activate} />
          {SHOT ? null : <DemoToolbar />}
        </>
      ) : (
        <div className={s.trayArea}>
          <Tray
            variant={layout === "tablet" ? "tablet" : "desktop"}
            slip={slip}
            offered={offered}
            staged={staged}
            onActivateCard={activate}
            onOpenPile={p => setLog(l => [...l.slice(-4), `open ${p}`])}
          />
        </div>
      )}
      <CardZoomHost actions={card => offered.has(card) ? (
        <Button variant="primary" size="touch" onClick={() => activate(card)}>
          {prompt?.kind === "headline" ? t("ui:slip.confirm.headline") : t("ui:slip.confirm.play", { card: cardName(card) })}
        </Button>
      ) : null} />
      <FlightLayer />
    </div>
  );
}

/** Variants built from a fixture (stills the recordings don't have). */
async function variantFixture(v: string): Promise<Fixture | null> {
  if (v === "committed") {
    const fx = await loadFixture("seq-headline");
    const f1 = fx.frames[1]!;
    const state = { ...f1.state, headline_stage: 0, headline_first_card: 0, headline_second_card: 0 } as PublicState;
    const frame = { ...f1, state, events: [] };
    return {
      ...fx, name: "variant-committed", kind: "scene", description: "Your headline committed, face down (seq-headline, edited)",
      frames: [fx.frames[0]!, frame], logs: fx.logs.slice(0, 2), frameVm: fx.frameVm.slice(0, 2),
      final: { ...fx.final, frame, prompt: null, aiThinking: true, log: fx.logs[1] ?? [] },
    };
  }
  if (v === "neutral") {
    const fx = await loadFixture("prompt-action-card");
    return { ...fx, name: "variant-neutral", description: "No prompt, nothing animating", final: { ...fx.final, prompt: null } };
  }
  return null;
}

function App({ fixture }: { fixture: Fixture | null }): ReactNode {
  return (
    <KeymapProvider>
      <DemoHarness scene="prompt-action-card-china" fixture={fixture ?? undefined}>
        <TrayBeatsProvider>
          <TrayDemo />
        </TrayBeatsProvider>
      </DemoHarness>
    </KeymapProvider>
  );
}

void (async () => {
  const fx = VARIANT ? await variantFixture(VARIANT) : null;
  await bootDemo(() => <App fixture={fx} />);
})();
