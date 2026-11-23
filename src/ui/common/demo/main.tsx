/**
 * Component sheet for src/ui/common + src/ui/cards (dev only; not a production build input).
 *   TSP_VITE_CACHE=node_modules/.vite-5181 npx vite --port 5181 --strictPort
 *   http://localhost:5181/TS_playfield/src/ui/common/demo/index.html?lang=en
 * Query: lang=en|zh|en-XA · open=dossier|sheet|zoom|popover|toasts · motion=reduce · side=US|USSR · layout=compact
 * The UiRoot and overlay contexts are a local mock (the real provider is the runner+state workstream's).
 */
import { StrictMode, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "../../theme/fonts.css";
import "../../theme/tokens.css";
import "../../theme/base.css";
import "./demo.css";
import { initLanguage, message, type Language } from "../../../i18n";
import { useI18n } from "../../../i18n/react";
import { setEngineLayout, type ActionLayout } from "../../../engine/layout";
import type { GameController, Prompt, PublicState, Side, ViewModel } from "../../../game/contract";
import { OverlayContext, UiRootContext, type OverlayState, type ToastItem, type ZoomState } from "../../state/context";
import { DEFAULT_SETTINGS, type UiRoot, type UiSettings } from "../../ui-contract";
import { layoutFor, type LayoutKind } from "../../theme";
import {
  Button, CountryPulseContext, Die, Dossier, HoldButton, Icon, ICON_NAMES, KeymapProvider, MessageText, Popover, RollingNumber, Seal,
  Sheet, SideGlyph, Stamp, Toaster, useKey, type ButtonVariant,
} from "..";
import { CardBack, CardFace, CardTags, CardZoomHost, ChinaCardFace, sortHand } from "../../cards";

const q = new URLSearchParams(location.search);
const HUMAN: Side = q.get("side") === "US" ? "US" : "USSR";
if (q.get("motion") === "reduce") document.documentElement.setAttribute("data-motion", "reduce");
document.documentElement.setAttribute("data-human", HUMAN);

// The engine's Space Race table (src/engine layout), so zoom notes can show the next box.
const SPACE_BOXES = [[0, 0, 0, 0], [2, 3, 2, 1], [2, 4, 0, 0], [2, 3, 2, 0], [2, 4, 0, 0], [3, 3, 3, 1], [3, 4, 0, 0], [3, 3, 4, 2], [4, 2, 2, 0]]
  .map(([min_ops, max_roll, vp_first, vp_second]) => ({ min_ops: min_ops!, max_roll: max_roll!, vp_first: vp_first!, vp_second: vp_second! }));
setEngineLayout({ space_boxes: SPACE_BOXES } as unknown as ActionLayout);

const HAND = sortHand([81, 39, 51, 58, 74]);
const PROMPT: Prompt = {
  kind: "action-card", promptId: 7, decisionType: 1, resolvingCard: 0, pendingCard: 0, opsValue: 0, remaining: 1, maxPerCountry: 0,
  options: [
    { idx: 81, kind: "card", id: 81 },
    { idx: 39, kind: "card", id: 39 },
    { idx: 51, kind: "card", id: 51 },
    { idx: 58, kind: "card", id: 58, warnings: [{ code: "scoring-stranded", params: { scoring: 1, plays: 0 } }] },
    { idx: 74, kind: "card", id: 74, warnings: [{ code: "opponent-event", params: { card: 74, side: "US" } }] },
    { idx: 6, kind: "card", id: 6 },
  ],
  cards: [81, 39, 51, 58, 74, 6], countries: [], title: message("prompt:title.actionCard"),
};
const EFFECTIVE: Record<number, number> = { 39: 3, 51: 3, 58: 3, 74: 2, 6: 4 };

function useDemoRoot(): { root: UiRoot; overlays: OverlayState; layout: LayoutKind } {
  const [layout, setLayout] = useState<LayoutKind>(() => (q.get("layout") as LayoutKind) ?? layoutFor(innerWidth, innerHeight));
  useEffect(() => {
    if (q.get("layout")) return;
    const on = () => setLayout(layoutFor(innerWidth, innerHeight));
    addEventListener("resize", on);
    return () => removeEventListener("resize", on);
  }, []);
  const [settings, setSettingsState] = useState<UiSettings>({ ...DEFAULT_SETTINGS, motion: q.get("motion") === "reduce" ? "reduce" : "system" });
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [zoom, setZoom] = useState<ZoomState | null>(null);
  const seq = useRef(0);
  const toast = useCallback<UiRoot["toast"]>((m, opts) => {
    const id = ++seq.current;
    setToasts(ts => [...ts, { id, message: m, tone: opts?.tone ?? "info", ms: opts?.ms ?? 3000 }]);
  }, []);
  const root = useMemo<UiRoot>(() => {
    const state = { space: { US: 3, USSR: 2 } } as unknown as PublicState;
    const vm: ViewModel = {
      status: "playing", humanSide: HUMAN, frame: { seq: 1, state, regionScores: [] as never, actor: null, events: [], auto: false },
      queued: 0, prompt: PROMPT, aiThinking: false, canUndo: true, log: [], ending: null, hasSavedGame: false,
    };
    const controller = {
      subscribe: () => () => undefined, getSnapshot: () => vm, boot: async () => undefined, newGame: async () => undefined,
      resume: async () => false, choose: () => undefined, undo: () => undefined, resign: () => undefined, ackFrame: () => undefined,
      coupOdds: () => null, effectiveOps: (c: number) => EFFECTIVE[c] ?? null,
    } as GameController;
    return {
      controller, vm, layout, settings, setSettings: p => setSettingsState(s => ({ ...s, ...p })),
      anchors: { ref: () => () => undefined, rect: id => (id === "slip" ? document.querySelector("[data-demo-slip]")?.getBoundingClientRect() ?? null : null) },
      director: { on: () => () => undefined, run: async () => undefined },
      zoomCard: (card, from) => setZoom({ card, from: from ?? null }),
      toast,
    };
  }, [layout, settings, toast]);
  const overlays = useMemo<OverlayState>(() => ({
    toasts, dismissToast: id => setToasts(ts => ts.filter(t => t.id !== id)), zoom, closeZoom: () => setZoom(null),
  }), [toasts, zoom]);
  return { root, overlays, layout };
}

function Section({ title, children, paper }: { title: string; children: ReactNode; paper?: boolean }) {
  return (
    <section className={`demo-sec${paper ? " demo-paper ts-on-paper" : ""}`}>
      <h2>{title}</h2>
      <div className="demo-row">{children}</div>
    </section>
  );
}

function LangSwitch() {
  const { lang, setLang } = useI18n();
  const langs: Language[] = ["en", "zh-CN", "en-XA"];
  return (
    <div className="demo-lang">
      {langs.map(l => <Button key={l} variant="ghost" size="s" pressed={lang === l} onClick={() => void setLang(l)}>{l}</Button>)}
    </div>
  );
}

function Demo() {
  const { root, overlays, layout } = useDemoRoot();
  const { t, cardName, sideName } = useI18n();
  const [dossier, setDossier] = useState(q.get("open") === "dossier");
  const [sheet, setSheet] = useState(q.get("open") === "sheet");
  const [pop, setPop] = useState<HTMLElement | null>(null);
  const [vp, setVp] = useState(2);
  const [holds, setHolds] = useState(0);
  const [pressed, setPressed] = useState<"1x" | "2x" | "skip">("1x");
  const popBtn = useRef<HTMLDivElement | null>(null);
  const firstCard = useRef<HTMLDivElement | null>(null);
  const opened = useRef(false);

  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    const o = q.get("open");
    if (o === "toasts") {
      root.toast(t("ui:toast.reshuffle"), { ms: 60000 });
      root.toast(t("ui:toast.defcon2"), { tone: "warn", ms: 60000 });
    }
    if (o === "zoom") setTimeout(() => root.zoomCard(74, firstCard.current?.querySelector("[data-card='74']") ?? null), 300);
    if (o === "popover") {
      popBtn.current?.scrollIntoView({ block: "center" });
      setTimeout(() => setPop(popBtn.current), 300);
    }
  }, [root, t]);

  useKey("t", () => root.toast(cardName(74)));

  const variants: ButtonVariant[] = ["brass", "dark", "ghost", "primary", "danger"];
  const logLine = message("prompt:warning.opponent-event", { card: { card: 74, name: "The Voice of America" }, side: { side: "US" } });
  const compact = layout === "compact" || layout === "compact-landscape";
  const cardW = compact ? 112 : 104;
  return (
    <UiRootContext.Provider value={root}>
      <OverlayContext.Provider value={overlays}>
        <CountryPulseContext.Provider value={id => root.toast(`pulse ${id}`)}>
          <div className={`demo ${compact ? "demo-compact" : ""}`}>
            <header className="demo-head">
              <h1>common + cards</h1>
              <span className="demo-meta">{layout} · {sideName(HUMAN)}</span>
              <LangSwitch />
            </header>

            <Section title="Glyphs · seals">
              <span className="demo-us"><SideGlyph side="US" size={16} /> <SideGlyph side="US" size={24} /> <SideGlyph side="US" size={48} /></span>
              <span className="demo-ussr"><SideGlyph side="USSR" size={16} /> <SideGlyph side="USSR" size={24} /> <SideGlyph side="USSR" size={48} /> <SideGlyph side="USSR" size={96} /></span>
              <Seal side="US" /><Seal side="USSR" /><Seal side="US" size={54} /><Seal side="USSR" size={54} /><Seal side="USSR" size={22} />
            </Section>

            <Section title="Icons">
              {ICON_NAMES.map(n => <span key={n} className="demo-icon" title={n}><Icon name={n} size={20} /></span>)}
            </Section>

            <Section title="Buttons · room">
              {variants.map(v => <Button key={v} variant={v} onClick={() => root.toast(v)}>{t("ui:action.confirm")}</Button>)}
              <Button variant="dark" icon="gear" onClick={() => undefined}>{t("ui:settings.title")}</Button>
              <Button variant="brass" size="touch" onClick={() => undefined}>{t("ui:menu.resume")}</Button>
              <Button variant="ghost" size="s" pressed onClick={() => undefined}>{t("ui:settings.speed.fast")}</Button>
              <Button variant="dark" disabled onClick={() => undefined}>{t("ui:action.cancel")}</Button>
            </Section>

            <Section title="Buttons · paper (slip)" paper>
              <Button variant="primary" onPaper kbd="↵" onClick={() => undefined}>{t("ui:action.confirm")}</Button>
              <Button variant="ghost" onPaper icon="undo" kbd="Z" size="s" onClick={() => undefined}>{t("ui:game.undo")}</Button>
              {(["1x", "2x", "skip"] as const).map(k => (
                <Button key={k} variant="ghost" onPaper size="s" pressed={pressed === k} onClick={() => setPressed(k)}>{k === "skip" ? <Icon name="skip" /> : k.replace("x", "×")}</Button>
              ))}
              <HoldButton label={t("prompt:warning.defcon-suicide")} onConfirm={() => { setHolds(h => h + 1); root.toast(t("prompt:warning.defcon-suicide"), { tone: "warn" }); }}>
                {t("prompt:warning.defcon-suicide")}
              </HoldButton>
              <span className="demo-note">× {holds}</span>
              <span data-demo-slip className="demo-slipmark" />
            </Section>

            <Section title="Stamps" paper>
              <Stamp side={HUMAN}>{t("ui:slip.stamp.you")}</Stamp>
              <Stamp side={HUMAN === "US" ? "USSR" : "US"} glyph tilt={-5}>{t("ui:slip.stamp.ai", { side: sideName(HUMAN === "US" ? "USSR" : "US") })}</Stamp>
              <Stamp size="m" tilt={-4}>{t("ui:stamp.headline")}</Stamp>
              <Stamp tone="alert" size="m" tilt={-7}>{t("ui:china.faceDown")}</Stamp>
              <Stamp size="l" side={HUMAN} tilt={-6}>{t("ui:ending.title.won")}</Stamp>
            </Section>

            <Section title="Dice · rolling numbers">
              {[1, 2, 3, 4, 5, 6].map(f => <Die key={`u${f}`} face={f} side="US" size={36} />)}
              {[1, 2, 3, 4, 5, 6].map(f => <Die key={`s${f}`} face={f} side="USSR" size={36} />)}
              <Die face={5} side="US" tilt={-8} result="ok" />
              <Die face={2} side="neutral" result="fail" />
              <Die face={1} side="USSR" result="boom" />
              <span className="demo-odds">
                {[1, 2, 3, 4, 5, 6].map(f => <Die key={f} numeral face={f} side="neutral" size={26} result={f === 1 ? "boom" : f >= 4 ? "ok" : "fail"} />)}
              </span>
              <span className="demo-roll">
                <Button variant="dark" size="s" onClick={() => setVp(v => v - 1)}>−</Button>
                <RollingNumber value={vp} signed />
                <Button variant="dark" size="s" onClick={() => setVp(v => v + 3)}>+</Button>
              </span>
            </Section>

            <Section title="Hand · captions · tags · dims">
              <div className="demo-hand" ref={firstCard}>
                {HAND.map((id, i) => {
                  const opt = PROMPT.options.find(o => o.id === id);
                  return (
                    <div key={id} className="demo-hcard" tabIndex={0} onClick={e => root.zoomCard(id, e.currentTarget.firstElementChild)} onKeyDown={e => { if (e.key === " ") { e.preventDefault(); root.zoomCard(id, e.currentTarget.firstElementChild); } }}>
                      <CardFace card={id} width={cardW} caption eager overlapRight={i < HAND.length - 1 ? 6 : 0} dim={i === 3 ? "unplayable" : "none"}
                        tags={<CardTags card={id} warnings={opt?.warnings} known={id === 51} />} />
                    </div>
                  );
                })}
              </div>
              <div className="demo-col">
                <CardFace card={21} width={cardW} caption dim="passive" />
                <span className="demo-note">passive</span>
              </div>
            </Section>

            <Section title="Backs · China Card · small sizes">
              <CardBack width={22} /><CardBack width={44} /><CardBack width={104} />
              <div className="demo-felt"><ChinaCardFace faceUp width={92} /></div>
              <div className="demo-felt"><ChinaCardFace faceUp={false} width={92} /></div>
              <ChinaCardFace faceUp={false} width={180} />
              <CardFace card={30} width={56} /><CardFace card={56} width={22} /><CardFace card={74} width={44} />
            </Section>

            <Section title="Message · refs" paper>
              <p className="demo-msg"><MessageText message={logLine} /></p>
              <p className="demo-msg"><MessageText message={message("prompt:doneFor.blockade", { country: { country: 7, name: "West Germany" } })} /></p>
            </Section>

            <Section title="Overlays">
              <Button variant="dark" onClick={() => setDossier(true)}>Dossier</Button>
              <Button variant="dark" onClick={() => setSheet(true)}>Sheet</Button>
              <div ref={popBtn} style={{ display: "inline-block" }}>
                <Button variant="dark" onClick={() => setPop(p => (p ? null : popBtn.current))}>Popover</Button>
              </div>
              <Button variant="dark" onClick={() => root.toast(cardName(74))}>Toast</Button>
              <Button variant="danger" onClick={() => root.toast(t("prompt:warning.cmc-suicide"), { tone: "warn" })}>Toast · warn</Button>
              <Button variant="brass" onClick={() => root.zoomCard(6, null)}>Zoom 6</Button>
            </Section>
            <div className="demo-toasts"><Toaster /></div>
          </div>

          {dossier ? (
            <Dossier
              tab={cardName(43)}
              title={t("ui:headline.choose")}
              onClose={() => setDossier(false)}
              footer={<>
                <Button variant="ghost" onPaper onClick={() => setDossier(false)}>{t("ui:action.cancel")}</Button>
                <Button variant="primary" onPaper kbd="↵" onClick={() => setDossier(false)}>{t("ui:action.confirm")}</Button>
              </>}
            >
              <div className="demo-picker">
                {[103, 21, 59, 69, 76, 30].map(id => (
                  <button key={id} type="button" className="demo-pick" onClick={() => root.zoomCard(id, null)}>
                    <CardFace card={id} width={compact ? 84 : 92} />
                  </button>
                ))}
              </div>
            </Dossier>
          ) : null}
          <Sheet open={sheet} onClose={() => setSheet(false)} height="60%" label={t("ui:pile.yourHand")} header={<span className="demo-sheethead">{t("ui:pile.yourHand")} · {HAND.length}</span>}>
            <div className="demo-drawer">
              {HAND.map(id => <CardFace key={id} card={id} width={112} caption />)}
              <ChinaCardFace faceUp={false} width={112} />
            </div>
          </Sheet>
          {pop ? (
            <Popover anchor={pop} tone="paper" placement="bottom" onClose={() => setPop(null)} label="popover">
              <div className="demo-popbody">
                <strong>{t("ui:china.name")}</strong>
                <span>{t("ui:china.faceDownHint")}</span>
              </div>
            </Popover>
          ) : null}
          <CardZoomHost actions={card => <Button variant="brass" size="touch" onClick={() => root.toast(cardName(card))}>{cardName(card)}</Button>} />
        </CountryPulseContext.Provider>
      </OverlayContext.Provider>
    </UiRootContext.Provider>
  );
}

await initLanguage();
createRoot(document.getElementById("root")!).render(<StrictMode><KeymapProvider><Demo /></KeymapProvider></StrictMode>);
