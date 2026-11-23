/**
 * Console + rail demo (dev only; not a production build input). Real fixtures through the real frame
 * runner: the console, the rail (desktop), the rail strip + flyouts (tablet), the compact console and the
 * rail sections in a bottom sheet (phone), with the real map, flights, toasts and the card zoom.
 *
 *   TSP_VITE_CACHE=node_modules/.vite-5186 npx vite --port 5186 --strictPort
 *   http://localhost:5186/TS_playfield/src/ui/console/demo/index.html?scene=prompt-midgame&lang=en
 *
 * Parameters: DemoHarness's (scene, lang, speed, motion, view, think, start…) plus
 *   page=game|variants   variants: every console variant stacked, the status panel, strip and flyouts
 *   flyout=adversary|effects|log|status   (tablet) open a flyout
 *   sheet=adversary|log|status            (compact) open a sheet
 *   rail=collapsed                        (desktop) the collapsed rail
 *   toolbar=off                           hide the dev toolbar (screenshots)
 */
import { useEffect, useRef, useState } from "react";
import { bootDemo, DemoHarness, DemoToolbar } from "../../../dev/DemoHarness";
import { useI18n } from "../../../i18n/react";
import { CardBack } from "../../cards/CardBack";
import { CardFace } from "../../cards/CardFace";
import { CardZoomHost } from "../../cards/CardZoom";
import { CountryPulseContext } from "../../common/countryPulse";
import { Sheet } from "../../common/Sheet";
import { Toaster } from "../../common/Toaster";
import { MapView, useMapBeats, type MapHandle } from "../../map";
import { Rail, RailFlyout, RailStrip, AdversarySection, EffectsSection, DispatchesSection, type RailPanelName } from "../../rail";
import { FlightLayer } from "../../runner/FlightLayer";
import { useOnCommit, useShown } from "../../runner/ShownContext";
import { useUiRoot, useVm } from "../../state/context";
import { Console, StatusPanel, type ConsoleVariant } from "..";
import s from "./demo.module.css";

const Q = new URLSearchParams(location.search);
const PAGE = Q.get("page") ?? "game";
const TOOLBAR = Q.get("toolbar") !== "off";
const PANELS: RailPanelName[] = ["adversary", "effects", "log", "status"];
const asPanel = (v: string | null): RailPanelName | null => (PANELS.includes(v as RailPanelName) ? (v as RailPanelName) : null);

function useWidth(): number {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return w;
}

/** Piles and the human's hand as plain anchors, so flights have somewhere to start and land. */
function MockPiles() {
  const root = useUiRoot();
  const shown = useShown();
  const vm = useVm();
  const st = shown.state;
  if (!st || !vm.humanSide) return null;
  const human = vm.humanSide;
  const top = (pile: readonly number[]) => pile[pile.length - 1];
  return (
    <div className={s.piles} data-dev="">
      <div className={s.hand} ref={root.anchors.ref(`hand:${human}`)}>
        {st.hands[human].slice(0, 9).map(c => <div key={c} ref={root.anchors.ref(`card:${c}`)}><CardFace card={c} width={40} /></div>)}
      </div>
      <div ref={root.anchors.ref(`headline:${human}`)} className={s.slot} />
      <div ref={root.anchors.ref("deck")} className={s.pile}><CardBack width={34} label="" /></div>
      <div ref={root.anchors.ref("discard")} className={s.pile}>{top(st.discard_pile) ? <CardFace card={top(st.discard_pile)!} width={34} /> : null}</div>
      <div ref={root.anchors.ref("removed")} className={s.pile}>{top(st.removed_pile) ? <CardFace card={top(st.removed_pile)!} width={34} /> : null}</div>
    </div>
  );
}

function Table({ compact }: { compact: boolean }) {
  const root = useUiRoot();
  const vm = useVm();
  const shown = useShown();
  const map = useRef<MapHandle>(null);
  useMapBeats(map, root.director, { layout: root.layout });
  useOnCommit(() => map.current?.clearOverrides());
  return (
    <main className={s.table} aria-busy={shown.busy} onClickCapture={e => { if (shown.busy && !(e.target as Element).closest("[data-dev]")) shown.skip(); }}>
      <MapView
        ref={map} state={shown.state} regionScores={shown.regionScores} humanSide={vm.humanSide ?? "USSR"} layout={root.layout}
        targets={null} regionTargets={null} selection={null} placed={shown.placedThisPlay} lastOpponent={shown.lastOpponent}
        focusRegion={null} interactive={!shown.busy} labelScale={root.settings.mapLabels / 100} patterns={root.settings.patterns}
        anchors={root.anchors} insets={{ bottom: compact ? 0 : 70 }} insetOverlap={compact ? 0 : 40}
      />
      <div className={s.stage} ref={root.anchors.ref("stage")} />
      {compact ? null : <MockPiles />}
      <Toaster />
      {TOOLBAR ? <div className={s.dev} data-dev=""><DemoToolbar inline /></div> : null}
    </main>
  );
}

function GameDemo() {
  const root = useUiRoot();
  const vm = useVm();
  const width = useWidth();
  const map = useRef<MapHandle>(null);
  const layout = root.layout;
  const variant: ConsoleVariant = layout === "desktop" ? (width >= 1440 ? "desktop" : "condensed") : layout === "tablet" ? "tablet" : "compact";
  const [flyout, setFlyout] = useState<RailPanelName | null>(asPanel(Q.get("flyout")));
  const [sheet, setSheet] = useState<RailPanelName | null>(asPanel(Q.get("sheet")));
  const [collapsed, setCollapsed] = useState(Q.get("rail") === "collapsed");
  const { t } = useI18n();
  const menu = () => root.toast("menu", { ms: 1200 });
  const settings = () => root.toast("settings", { ms: 1200 });
  return (
    <CountryPulseContext.Provider value={id => map.current?.pulse(id)}>
      <div className={`${s.game} ${s[`g_${variant}`]} ${collapsed && variant !== "tablet" && variant !== "compact" ? s.railCollapsed : ""}`} data-human={vm.humanSide ?? undefined}>
        <Console variant={variant} onMenu={menu} onSettings={settings} />
        <Table compact={variant === "compact"} />
        {variant === "desktop" || variant === "condensed" ? <Rail collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} /> : null}
        {variant === "tablet" ? (
          <>
            <div className={s.stripCol}><RailStrip open={flyout} onOpen={p => setFlyout(f => (f === p ? null : p))} /></div>
            {flyout ? <div className={s.flyoutHost}><RailFlyout panel={flyout} onClose={() => setFlyout(null)} /></div> : null}
          </>
        ) : null}
        {variant === "compact" ? (
          <>
            <nav className={s.dock} data-dev="">
              {(["adversary", "log", "status"] as const).map(p => (
                <button key={p} type="button" aria-pressed={sheet === p} onClick={() => setSheet(p)}>
                  {p === "adversary" ? t("ui:adversary.title") : p === "log" ? t("ui:log.title") : t("ui_console:status.title")}
                </button>
              ))}
            </nav>
            <Sheet open={!!sheet} onClose={() => setSheet(null)} height={sheet === "log" ? "80%" : "auto"} label={sheet ?? ""}>
              <div className={`${s.sheetBody} ${sheet === "log" ? s.sheetFill : ""}`}>
                {sheet === "adversary" ? <><AdversarySection /><EffectsSection /></> : null}
                {sheet === "log" ? <DispatchesSection bare /> : null}
                {sheet === "status" ? <StatusPanel /> : null}
              </div>
            </Sheet>
          </>
        ) : null}
        <FlightLayer />
        <CardZoomHost />
      </div>
    </CountryPulseContext.Provider>
  );
}

function VariantsDemo() {
  const [flyout, setFlyout] = useState<RailPanelName | null>(null);
  return (
    <div className={s.variants}>
      {(["desktop", "condensed", "tablet", "compact"] as const).map(v => (
        <section key={v} className={s.variantRow} data-variant={v}>
          <h2 className={s.variantName} data-dev="">{v}</h2>
          <div className={s[`w_${v}`]}><Console variant={v} /></div>
        </section>
      ))}
      <div className={s.panels}>
        <div className={s.panelCol}><StatusPanel /></div>
        <div className={s.panelCol}><AdversarySection /><EffectsSection /></div>
        <div className={`${s.panelCol} ${s.logCol}`}><DispatchesSection /></div>
        <div className={s.stripDemo}>
          <RailStrip open={flyout} onOpen={p => setFlyout(f => (f === p ? null : p))} />
          {flyout ? <div className={s.flyoutHost}><RailFlyout panel={flyout} onClose={() => setFlyout(null)} /></div> : null}
        </div>
      </div>
      {TOOLBAR ? <div className={s.devFixed} data-dev=""><DemoToolbar inline /></div> : null}
      <Toaster fixed />
      <CardZoomHost />
      <FlightLayer />
    </div>
  );
}

void bootDemo(() => (
  <DemoHarness scene="prompt-midgame">
    {PAGE === "variants" ? <VariantsDemo /> : <GameDemo />}
  </DemoHarness>
));
