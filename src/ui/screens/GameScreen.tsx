/**
 * The game screen (ui-spec §3, §15.3 W1): one React tree for the four arrangements.
 *
 *   desktop  console · table (map + stage + play-mode stage) · rail · tray (slip, hand, China, piles)
 *   tablet   the same, with the rail strip + flyouts and a smaller tray
 *   compact  console · theatre bar · table (+ ticker) · orders sheet · dock (+ its sheets)
 *   compact-landscape  map at full height | console · orders · dock in a 300 px column
 *
 * It wires the prompt layer (map props, hand offers, the slip, the play-mode stage, dialogs), the
 * stage (one Stage, the telex, the danger frame), the runner's flight layer, the shared card zoom,
 * the skip keys and the menu.
 */
import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import type { PlayHow, Side } from "../../game/contract";
import { useI18n } from "../../i18n/react";
import { CardZoomHost } from "../cards/CardZoom";
import { CountryPulseContext } from "../common/countryPulse";
import { useKey } from "../common/keymap";
import { Toaster } from "../common/Toaster";
import { BottomDock, type DockPanel } from "../compact/BottomDock";
import { CompactSheets } from "../compact/CompactSheets";
import { framedSlot, TheatreBar } from "../compact/TheatreBar";
import { Ticker } from "../compact/Ticker";
import { Console, type ConsoleVariant } from "../console";
import { MapView, useMapBeats, type MapHandle } from "../map";
import { scoreOf } from "../map/board";
import {
  CardPicker, CardSheetActions, OrdersSlip, PromptDialogs, PromptStage, useHandProps, usePromptActions, usePromptMapProps, usePromptUi,
} from "../prompts";
import { AiAnnouncer, Rail, RailFlyout, RailStrip, type RailPanelName } from "../rail";
import { useRailBeats } from "../rail/useRailBeats";
import { FlightLayer } from "../runner/FlightLayer";
import { useOnCommit, useShown } from "../runner/ShownContext";
import { DangerFrame, GameOverTelex, ScoringTable, Stage } from "../stage";
import { useUiRoot } from "../state/context";
import { trayHeight } from "../theme";
import { isHandPrompt, Tray, TrayBeatsProvider } from "../tray";
import type { RegionSlot } from "../ui-contract";
import { focusQuietly, useFocusRescue } from "./focusRescue";
import { Menu } from "./Menu";
import { useShell } from "./shellContext";
import s from "./GameScreen.module.css";

/** The viewport size, updated on resize (rAF-throttled). */
export function useViewport(): { w: number; h: number } {
  const read = () => (typeof window === "undefined" ? { w: 1440, h: 900 } : { w: window.innerWidth, h: window.innerHeight });
  const [v, setV] = useState(read);
  useEffect(() => {
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setV(read()));
    };
    window.addEventListener("resize", on);
    window.addEventListener("orientationchange", on);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", on);
      window.removeEventListener("orientationchange", on);
    };
  }, []);
  return v;
}

/** The console variant for a layout and width (ui-spec §3.1–3.3). */
export function consoleVariant(layout: string, width: number): ConsoleVariant {
  if (layout === "desktop") return width >= 1440 ? "desktop" : "condensed";
  if (layout === "tablet") return "tablet";
  return "compact";
}

/**
 * Where "Skip to map" (and a game screen that just opened) puts focus: the map's roving box (the first
 * legal target while a map prompt is open, ui-spec §12), else the table itself (tabindex −1).
 */
export function mapFocusTarget(table: ParentNode & Partial<HTMLElement> | null): HTMLElement | null {
  if (!table) return null;
  return table.querySelector<HTMLElement>("[data-cid][tabindex='0']") ?? (table as HTMLElement);
}

/** The stable place for lost focus: the orders slip (its labelled region), else the table. */
export function focusFallback(game: ParentNode | null, table: HTMLElement | null): HTMLElement | null {
  return game?.querySelector<HTMLElement>("section[data-mode][data-variant]") ?? table;
}

/**
 * A camera view near the one a chip tap produced (same centre within 12 % of the view, same scale within
 * 8 %): a container resize or a settle of that same frame, not a pan or zoom elsewhere.
 */
export function sameFraming(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  const dx = Math.abs(a.x + a.w / 2 - (b.x + b.w / 2));
  const dy = Math.abs(a.y + a.h / 2 - (b.y + b.h / 2));
  return dx <= 0.12 * Math.max(a.w, b.w) && dy <= 0.12 * Math.max(a.h, b.h) && Math.abs(a.w / b.w - 1) <= 0.08;
}

/**
 * Whether a pointerdown at `target` closes the open tablet flyout (ui-spec §3.2 as built, R-017): a press on the
 * game screen (`screen`: the map, the stage, the slip, the hand, the console) outside every `keep` element (the
 * flyout, the rail strip whose buttons toggle it, the toasts above it). Layers above the screen (dialogs, the menu,
 * the card zoom) render outside `screen`, so a press there keeps it. The press is never swallowed: it also acts
 * on what it hit.
 */
export function closesFlyout(target: EventTarget | null, screen: Node | null, keep: readonly (Node | null | undefined)[]): boolean {
  const node = target as Node | null;
  if (!screen || !node || typeof node.nodeType !== "number" || !screen.contains(node)) return false;
  return !keep.some(k => !!k && k.contains(node));
}

/**
 * The compact dock's open sheet once the hand is asked to focus a card (`PromptStore.focusCard`, D-201 / R3-10: "Back
 * to hand", Esc or close on the play-mode sheet): the hand drawer, where that card is. Elsewhere, or with no request,
 * the dock stays as it is.
 */
export function dockForFocus(compact: boolean, focusCard: number | null, dock: DockPanel | null): DockPanel | null {
  return compact && focusCard !== null ? "hand" : dock;
}

/** Clicks that should not skip an animation (controls keep working while frames play). */
const NO_SKIP = "button, a, input, select, textarea, [role=button]:not([data-country]), [role=dialog], [data-no-skip]";

export function GameScreen() {
  const root = useUiRoot();
  const human: Side = root.vm.humanSide ?? "US";
  return (
    <TrayBeatsProvider humanSide={human}>
      <GameScreenBody />
    </TrayBeatsProvider>
  );
}

function GameScreenBody() {
  const root = useUiRoot();
  const vm = root.vm;
  const shown = useShown();
  const shell = useShell();
  const { t } = useI18n();
  const layout = root.layout;
  const settings = root.settings;
  const compact = layout === "compact" || layout === "compact-landscape";
  const landscape = layout === "compact-landscape";
  const tablet = layout === "tablet";
  const desktop = layout === "desktop";
  const vp = useViewport();
  const variant = consoleVariant(layout, vp.w);
  const human: Side = vm.humanSide ?? shown.state?.humanSide ?? "US";
  const ai: Side = human === "US" ? "USSR" : "US";

  // ── map, beats, overrides ──
  const map = useRef<MapHandle>(null);
  useMapBeats(map, root.director, { layout });
  useOnCommit(() => map.current?.clearOverrides());
  useRailBeats(root.director, ai);
  const pulse = useCallback((id: number) => map.current?.pulse(id), []);

  // ── prompt layer ──
  const mapProps = usePromptMapProps();
  const hand = useHandProps();
  const actions = usePromptActions();

  // ── local UI state ──
  const [stageFocus, setStageFocus] = useState<RegionSlot | null>(null);
  const [pile, setPile] = useState<"discard" | "removed" | null>(null);
  const [menu, setMenu] = useState<{ anchor: Element | null } | null>(null);
  const [flyout, setFlyout] = useState<RailPanelName | null>(null);
  const [dock, setDock] = useState<DockPanel | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [framed, setFramed] = useState<RegionSlot | null>(null);
  const [aiHow, setAiHow] = useState<PlayHow | null>(null);

  // The AI play's mode for the compact play banner.
  useEffect(() => root.director.on("reveal", async b => { if (!b.byHuman) setAiHow(b.how); }), [root.director]);

  // Compact: the hand drawer opens by itself on card prompts and closes on other prompts (§3.3).
  const promptId = vm.prompt?.promptId ?? null;
  const handCards = shown.state?.hands?.[human];
  // It also closes once the card is chosen (no prompt while the play resolves), so the stage's
  // big moments (headline papers, the scoring sheet) are not left under its scrim.
  useEffect(() => {
    if (!compact) return;
    if (vm.prompt && isHandPrompt(vm.prompt, handCards ?? [])) setDock("hand");
    else setDock(d => (d === "hand" ? null : d));
    setExpanded(false);
  }, [compact, promptId]); // eslint-disable-line react-hooks/exhaustive-deps

  // D-201 (R3-10): "Back to hand" / Esc / close on the compact play-mode sheet asks the hand to focus the card that
  // returns (`PromptStore.focusCard`). The card is in the hand drawer: open it, as the dock's Hand button does, and
  // move no focus here: the drawer takes focus as it opens and serves the request (its card, never the sheet's opener).
  const focusCard = usePromptUi("focusCard");
  useEffect(() => { setDock(d => dockForFocus(compact, focusCard, d)); }, [compact, focusCard]);

  // ── keys (ui-spec §12): skip while busy, skip to my turn, the log on compact ──
  useKey("Space", () => { if (!shown.busy) return false; shown.skip(); });
  useKey("Escape", () => { if (!shown.busy) return false; shown.skip(); });
  useKey("Shift+Space", () => { shown.skipToMyTurn(); });
  useKey("l", () => { if (!compact) return false; setDock(d => (d === "log" ? null : "log")); }, { enabled: compact });
  // Camera keys anywhere (§12 "+ − 0: camera"); a focused map box handles them itself first.
  useKey(["+", "="], () => { map.current?.zoomBy(1.5); });
  useKey(["-", "_"], () => { map.current?.zoomBy(1 / 1.5); });
  useKey("0", () => { void map.current?.frame("world", { animate: true }); });

  // ── focus (§12): never lost to <body> ──
  const gameEl = useRef<HTMLDivElement | null>(null);
  const tableEl = useRef<HTMLElement | null>(null);
  useFocusRescue(() => focusFallback(gameEl.current, tableEl.current));

  // Tablet flyouts: a press outside the flyout and the strip closes it (touch screens have no Esc; R-017).
  const flyoutEl = useRef<HTMLDivElement | null>(null);
  const stripEl = useRef<HTMLDivElement | null>(null);
  const toastEl = useRef<HTMLDivElement | null>(null);
  const flyoutOpen = tablet && flyout !== null;
  useEffect(() => {
    if (!flyoutOpen) return;
    const onDown = (e: globalThis.PointerEvent) => {
      if (e.button > 0) return;
      if (closesFlyout(e.target, gameEl.current, [flyoutEl.current, stripEl.current, toastEl.current])) setFlyout(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [flyoutOpen]);
  // The game screen replaces the start screen (whose side folder had focus): start at the table.
  useEffect(() => {
    const a = document.activeElement;
    if (!a || a === document.body) focusQuietly(tableEl.current);
  }, []);

  const onTableClick = (e: MouseEvent<HTMLElement>) => {
    if (!shown.busy) return;
    const target = e.target as Element | null;
    if (target?.closest(NO_SKIP)) return;
    shown.skip();
  };

  const openLog = () => {
    if (compact) setDock("log");
    else if (tablet) setFlyout("log");
    else if (settings.railCollapsed) root.setSettings({ railCollapsed: false });
  };

  // The pressed theatre chip follows the camera (deviation 6), but a chip's own frame keeps that chip
  // pressed until the camera moves elsewhere (a pan, a zoom, the follow camera): a tall portrait view of
  // SE Asia also holds most of Asia (Q-047).
  const chipFrame = useRef<{ slot: RegionSlot | null; view: { x: number; y: number; w: number; h: number } | null } | null>(null);
  const onCamera = (v: { x: number; y: number; w: number; h: number }) => {
    const tap = chipFrame.current;
    if (tap && (!tap.view || sameFraming(v, tap.view))) {
      tap.view ??= v;
      setFramed(tap.slot);
      return;
    }
    chipFrame.current = null;
    setFramed(framedSlot(v));
  };

  const trayH = compact ? 0 : trayHeight(vp.h, layout);
  const state = shown.state;
  const lastAiEntry = (() => {
    for (let i = vm.log.length - 1; i >= 0; i--) {
      const e = vm.log[i]!;
      if (e.side === ai && (e.kind === "play" || e.kind === "headline" || e.kind === "event")) return e;
    }
    return null;
  })();

  const mapView = (
    <MapView
      ref={map}
      state={state}
      regionScores={shown.regionScores}
      humanSide={human}
      layout={layout}
      {...mapProps}
      focusRegion={stageFocus ?? mapProps.focusRegion}
      placed={shown.placedThisPlay}
      lastOpponent={shown.lastOpponent}
      labelScale={settings.mapLabels / 100}
      patterns={settings.patterns}
      anchors={root.anchors}
      insets={{ bottom: Math.max(0, trayH - 6) }}
      insetOverlap={desktop ? 64 : tablet ? 48 : 0}
      follow={settings.followAction}
      promptKey={vm.prompt?.promptId ?? null}
      onCamera={compact ? onCamera : undefined}
      renderPlateTooltip={slot => {
        const sc = scoreOf(shown.regionScores, slot);
        return sc ? <ScoringTable score={sc} /> : null;
      }}
    />
  );

  const regionPrompt = vm.prompt?.kind === "region";
  const theatre = compact ? (
    <TheatreBar
      targets={mapProps.targets}
      framed={framed}
      overlay={landscape}
      className={landscape ? s.theatreOverlay : s.theatre}
      regionTargets={regionPrompt ? mapProps.regionTargets : null}
      stagedRegion={actions.staged?.kind === "region" ? (actions.staged.id as RegionSlot) : null}
      onRegionActivate={actions.activateRegion}
      onRegionHover={actions.hoverRegion}
      onFrame={slot => {
        chipFrame.current = { slot: slot === "world" ? null : slot, view: null };
        setFramed(slot === "world" ? null : slot);
        if (slot === "world") void map.current?.frame("world", { animate: true });
        else void map.current?.frameRegion(slot, { animate: true });
      }}
    />
  ) : null;

  const grabStart = useRef<number | null>(null);
  const onGrabDown = (e: PointerEvent<HTMLButtonElement>) => { grabStart.current = e.clientY; };
  const onGrabUp = (e: PointerEvent<HTMLButtonElement>) => {
    const y0 = grabStart.current;
    grabStart.current = null;
    if (y0 === null) return;
    const dy = e.clientY - y0;
    if (dy < -24) setExpanded(true);
    else if (dy > 24) setExpanded(false);
  };

  const cls = [
    s.game,
    s[layout === "compact-landscape" ? "landscape" : layout],
    desktop && settings.railCollapsed ? s.railCollapsed : "",
  ].filter(Boolean).join(" ");

  return (
    <CountryPulseContext.Provider value={pulse}>
      <div className={cls} data-layout={layout} data-human={human} ref={gameEl}>
        <a className={s.skipLink} href="#ts-map" onClick={e => { e.preventDefault(); focusQuietly(mapFocusTarget(tableEl.current)); }}>
          {t("ui:a11y.skipToMap")}
        </a>
        <Console
          variant={variant}
          className={s.console}
          onSettings={() => shell?.open("settings")}
          onMenu={anchor => setMenu(m => (m ? null : { anchor: compact ? null : anchor }))}
          menuOpen={!!menu}
        />
        {compact && !landscape ? theatre : null}

        <main
          id="ts-map"
          ref={tableEl}
          tabIndex={-1}
          className={s.table}
          aria-label={t("ui_shell:table.label")}
          aria-busy={shown.busy}
          onClickCapture={onTableClick}
        >
          <div className={s.mapFrame}>{mapView}</div>
          <Stage onFocusRegion={setStageFocus} className={s.stage} />
          <PromptStage />
          {landscape ? theatre : null}
          {compact ? (
            <Ticker
              entry={lastAiEntry}
              aiPlayCard={shown.aiPlayCard}
              aiSide={ai}
              how={aiHow}
              ar={state?.current_phase_name === "ACTION_ROUND" ? state.action_round : 0}
              quiet={shown.actor === human}
              onOpenLog={() => setDock("log")}
              className={landscape ? s.tickerLandscape : undefined}
            />
          ) : null}
          {tablet && flyout ? (
            <div className={s.flyoutHost} ref={flyoutEl}>
              <RailFlyout panel={flyout} onClose={() => setFlyout(null)} />
            </div>
          ) : null}
          <div className={s.toastHost} ref={toastEl}>
            <Toaster />
          </div>
        </main>

        {!compact ? (
          <div className={s.trayArea}>
            <Tray
              variant={tablet ? "tablet" : "desktop"}
              slip={<OrdersSlip variant={tablet ? "tablet" : "desktop"} />}
              offered={hand.offered}
              staged={hand.staged}
              onActivateCard={hand.onActivate}
              onOpenPile={setPile}
            />
          </div>
        ) : null}

        {desktop ? (
          <Rail
            className={s.rail}
            collapsed={settings.railCollapsed}
            onToggle={() => root.setSettings({ railCollapsed: !root.settings.railCollapsed })}
          />
        ) : null}
        {tablet ? (
          <div className={s.stripCol} ref={stripEl}>
            <RailStrip open={flyout} onOpen={p => setFlyout(f => (f === p ? null : p))} />
          </div>
        ) : null}

        {compact ? (
          <>
            <section className={[s.sheet, expanded ? s.sheetExpanded : ""].filter(Boolean).join(" ")} aria-label={t("ui_shell:sheet.label")}>
              <button
                type="button"
                className={s.grab}
                aria-expanded={expanded}
                aria-label={expanded ? t("ui_shell:sheet.collapse") : t("ui_shell:sheet.expand")}
                onClick={() => setExpanded(x => !x)}
                onPointerDown={onGrabDown}
                onPointerUp={onGrabUp}
              />
              <div className={s.sheetSlip}>
                <OrdersSlip variant="compact" expanded={expanded} />
              </div>
            </section>
            <BottomDock className={s.dock} open={dock} onOpen={p => setDock(d => (d === p ? null : p))} iconsOnly={landscape} />
            <CompactSheets
              panel={dock}
              onClose={() => setDock(null)}
              offered={hand.offered}
              staged={hand.staged}
              onActivateCard={hand.onActivate}
              onOpenPile={setPile}
            />
          </>
        ) : null}
      </div>

      <AiAnnouncer />
      <PromptDialogs />
      {pile ? <CardPicker browse={pile} onClose={() => setPile(null)} /> : null}
      <CardZoomHost actions={card => <CardSheetActions card={card} />} />
      <FlightLayer />
      <DangerFrame />
      {vm.ending && vm.humanSide ? (
        <GameOverTelex
          key={`${shell?.gameKey ?? 0}:${shell?.telexKey ?? 0}`}
          ending={vm.ending}
          humanSide={vm.humanSide}
          onNewGame={() => shell?.toStart()}
          onReview={() => { /* the telex closes itself; the slip keeps the Game over chip */ }}
          onLog={openLog}
        />
      ) : null}
      {menu ? (
        <Menu
          anchor={menu.anchor}
          onClose={() => setMenu(null)}
          onOpen={d => shell?.open(d)}
          onNewGameNow={() => shell?.toStart()}
        />
      ) : null}
    </CountryPulseContext.Provider>
  );
}
