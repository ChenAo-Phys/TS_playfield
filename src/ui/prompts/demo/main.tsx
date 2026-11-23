/**
 * Prompts demo (dev only; not a production build input): every PromptKind from the recorded fixtures,
 * on the real map, with the orders slip, a stand-in hand and piles, the play-mode stage, the dossiers,
 * the card zoom / compact card sheet, and a log of the calls the controller received.
 *
 *   TSP_VITE_CACHE=node_modules/.vite-5185 npx vite --port 5185 --strictPort
 *   http://localhost:5185/TS_playfield/src/ui/prompts/demo/index.html?scene=prompt-influence&lang=en
 *
 * Parameters: those of DemoHarness (scene, lang, view, speed, motion, …) plus `variant`:
 *   picker   the event-card prompt as SALT Negotiations (a card picker over the discard pile)
 *   wargames the branch prompt as Wargames (the "end the game" tile needs the hold)
 *   hold     the coup prompt with a certain DEFCON suicide on Iran (hold on the slip)
 *   ai       the scene with the AI thinking (no prompt)
 *   pile     the discard-pile viewer open
 * The stand-in hand / piles / console are demo chrome (dev text), not the tray's or console's design.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { bootDemo, DemoHarness, DemoToolbar, demoParams } from "../../../dev/DemoHarness";
import type { ControllerCall } from "../../../dev/FixtureController";
import type { Fixture } from "../../../dev/fixtureFormat";
import { loadFixture } from "../../../dev/fixtures";
import { WasmEngine } from "../../../engine/wasm_engine";
import type { Prompt, PromptOption } from "../../../game/contract";
import { useI18n } from "../../../i18n/react";
import { CardFace } from "../../cards/CardFace";
import { CardZoomHost } from "../../cards/CardZoom";
import { KeymapProvider } from "../../common/keymap";
import { Stamp } from "../../common/Stamp";
import { Toaster } from "../../common/Toaster";
import { MapView, useMapBeats, type MapHandle } from "../../map";
import { useOnCommit, useShown } from "../../runner/ShownContext";
import { FlightLayer } from "../../runner/FlightLayer";
import { useUiRoot } from "../../state/context";
import { CardPicker, CardSheetActions, OrdersSlip, PromptDialogs, PromptStage, useCardPeek, useHandProps, usePromptMapProps } from "..";
import s from "./demo.module.css";

const q = new URLSearchParams(location.search);
const variant = q.get("variant");

function patchFixture(fx: Fixture): Fixture {
  const final = fx.final;
  const p = final.prompt;
  if (variant === "ai") return { ...fx, final: { ...final, prompt: null, aiThinking: true } };
  if (!p) return fx;
  if (variant === "picker" && p.kind === "event-card") {
    const discard = final.frame!.state.discard_pile.filter(c => ![1, 2, 3, 37, 38, 79, 81].includes(c));
    const options: PromptOption[] = discard.map((id, i) => ({ idx: 300 + i, kind: "card", id, endsPlay: true }));
    const done: PromptOption = { idx: 208, kind: "done", id: 0, endsPlay: true };
    const np: Prompt = {
      ...p, resolvingCard: 43, pendingCard: 43, options: [...options, done], cards: discard, done, doneMeaning: "skip",
      title: { key: "prompt:card.43.card" }, detail: { key: "prompt:card.43.detail" },
    };
    return { ...fx, final: { ...final, prompt: np } };
  }
  if (variant === "wargames" && p.kind === "branch") {
    const np: Prompt = { ...p, resolvingCard: 100, title: { key: "prompt:card.100.branch" }, detail: { key: "prompt:card.100.detail" } };
    return { ...fx, final: { ...final, prompt: np } };
  }
  if (variant === "hold" && p.kind === "coup-target") {
    const np: Prompt = { ...p, options: p.options.map(o => (o.id === 25 ? { ...o, warnings: [{ code: "defcon-suicide", params: { faces: 6 } }] } : o)) };
    return { ...fx, final: { ...final, prompt: np } };
  }
  return fx;
}

function DemoHand({ compact }: { compact: boolean }) {
  const root = useUiRoot();
  const shown = useShown();
  const { t } = useI18n();
  const hand = useHandProps();
  const human = root.vm.humanSide ?? "US";
  const cards = [...(shown.state?.hands?.[human] ?? [])];
  const china = shown.state?.china_card;
  if (china?.holder === human) cards.push(6);
  return (
    <div className={compact ? s.drawer : s.hand} data-mode={hand.mode}>
      {cards.map(card => <HandCard key={card} card={card} hand={hand} compact={compact} stampText={t(`ui:stamp.${hand.stamp}`)} />)}
    </div>
  );
}

function HandCard({ card, hand, compact, stampText }: { card: number; hand: ReturnType<typeof useHandProps>; compact: boolean; stampText: string }) {
  const root = useUiRoot();
  const peek = useCardPeek(card);
  const ref = useRef<HTMLButtonElement | null>(null);
  const offered = hand.offered.get(card);
  const staged = hand.staged === card;
  const out = hand.liftedOut === card;
  const dim = hand.mode === "active" ? (offered ? "none" : "unplayable") : hand.mode === "passive" ? "passive" : "none";
  return (
    <button
      ref={ref}
      type="button"
      className={[s.card, offered ? s.offered : "", staged ? s.lifted : "", out ? s.out : ""].join(" ")}
      {...(compact ? {} : peek)}
      onClick={() => (compact ? root.zoomCard(card, ref.current) : hand.onActivate(card))}
    >
      <CardFace card={card} width={compact ? 112 : 104} caption dim={dim} eager />
      {staged ? <span className={s.stamp}><Stamp size="m" side={root.vm.humanSide}>{stampText}</Stamp></span> : null}
    </button>
  );
}

function CallLog() {
  const [calls, setCalls] = useState<string[]>([]);
  useEffect(() => {
    const on = (e: Event) => setCalls(c => [...c.slice(-12), JSON.stringify((e as CustomEvent<ControllerCall>).detail)]);
    window.addEventListener("demo-call", on);
    return () => window.removeEventListener("demo-call", on);
  }, []);
  return (
    <div className={s.calls} data-dev="">
      <b>controller calls</b>
      {calls.map((c, i) => <div key={i}>{c}</div>)}
    </div>
  );
}

function Table({ children }: { children?: ReactNode }) {
  const root = useUiRoot();
  const shown = useShown();
  const map = useRef<MapHandle>(null);
  const props = usePromptMapProps();
  const layout = root.layout;
  const compact = layout === "compact" || layout === "compact-landscape";
  useMapBeats(map, root.director, { layout });
  useOnCommit(() => map.current?.clearOverrides());
  return (
    <main className={s.table} ref={root.anchors.ref("stage")}>
      <MapView
        ref={map}
        state={shown.state}
        regionScores={shown.regionScores}
        humanSide={root.vm.humanSide ?? "US"}
        layout={layout}
        placed={shown.placedThisPlay}
        lastOpponent={shown.lastOpponent}
        labelScale={root.settings.mapLabels / 100}
        patterns={root.settings.patterns}
        insets={compact ? undefined : { bottom: layout === "tablet" ? 140 : 170 }}
        insetOverlap={compact ? 0 : 64}
        anchors={root.anchors}
        {...props}
      />
      <PromptStage />
      {children}
    </main>
  );
}

function Screen() {
  const root = useUiRoot();
  const layout = root.layout;
  const compact = layout === "compact" || layout === "compact-landscape";
  const [expanded, setExpanded] = useState(false);
  const [pile, setPile] = useState<"discard" | "removed" | null>(variant === "pile" ? "discard" : null);
  const shown = useShown();
  if (compact) {
    return (
      <div className={`${s.screen} ${s.compact}`}>
        <header className={s.console}>TS · prompts demo</header>
        <Table />
        <div className={s.sheet}>
          <button type="button" className={s.grab} aria-label="expand" onClick={() => setExpanded(e => !e)} />
          <OrdersSlip variant="compact" expanded={expanded} />
        </div>
        <nav className={s.dock}><DemoHand compact /></nav>
        <PromptDialogs />
        <CardZoomHost actions={card => <CardSheetActions card={card} />} />
        <Toaster fixed />
        <FlightLayer />
      </div>
    );
  }
  return (
    <div className={s.screen} data-layout={layout}>
      <header className={s.console}>TS · prompts demo</header>
      <Table />
      <aside className={s.rail}><CallLog /></aside>
      <footer className={s.tray}>
        <OrdersSlip variant={layout === "tablet" ? "tablet" : "desktop"} />
        <DemoHand compact={false} />
        <div className={s.piles}>
          <button type="button" onClick={() => setPile("discard")} ref={root.anchors.ref("discard")}>discard · {shown.state?.discard_pile.length ?? 0}</button>
          <button type="button" onClick={() => setPile("removed")} ref={root.anchors.ref("removed")}>removed · {shown.state?.removed_pile.length ?? 0}</button>
        </div>
      </footer>
      <PromptDialogs />
      {pile ? <CardPicker browse={pile} onClose={() => setPile(null)} /> : null}
      <CardZoomHost actions={card => <CardSheetActions card={card} />} />
      <Toaster fixed />
      <FlightLayer />
    </div>
  );
}

function App() {
  const params = useMemo(() => demoParams(), []);
  const [fx, setFx] = useState<Fixture | null>(null);
  useEffect(() => {
    loadFixture(params.scene ?? "prompt-influence").then(f => setFx(patchFixture(f)));
  }, [params.scene]);
  if (!fx) return null;
  return (
    <KeymapProvider>
      <DemoHarness
        fixture={fx}
        controllerOptions={{ onCall: call => window.dispatchEvent(new CustomEvent("demo-call", { detail: call })) }}
      >
        <DemoToolbar extra={<span className={s.variant}>{variant ?? ""}</span>} />
        <Screen />
      </DemoHarness>
    </KeymapProvider>
  );
}

// The engine's layout (branch names, the Space Race track) as the page would have it.
WasmEngine.load().catch(e => console.warn("engine layout not loaded:", e)).finally(() => { void bootDemo(() => <App />); });
