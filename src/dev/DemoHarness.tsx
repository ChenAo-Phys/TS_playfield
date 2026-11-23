/**
 * Dev-only harness for demo pages (never imported by production code): renders components on a
 * recorded fixture with the real providers.
 *
 *   // src/ui/<yours>/demo/main.tsx
 *   import { bootDemo, DemoHarness, DemoToolbar } from "../../../dev/DemoHarness";
 *   bootDemo(() => (
 *     <DemoHarness scene="prompt-coup-target">          // or ?scene=… in the URL (wins)
 *       <DemoToolbar />
 *       <MyComponent />                                 // useUiRoot(), useVm(), useShown() all work
 *     </DemoHarness>
 *   ));
 *
 * = UiRootProvider(FixtureController) + ShownProvider (the real frame runner). URL parameters
 * (`demoParams()`): scene, lang (en | zh | en-XA, read by initLanguage), start (begin | end),
 * speed (slow | normal | fast | instant), motion (system | reduce | full), view (desktop | tablet |
 * compact | compact-landscape), queued (zero | remaining | recorded), think (ms of AI "thinking"
 * before each AI frame), labels (100 | 115 | 130), patterns (on).
 * Settings live in memory (the page's real settings are not touched).
 */
import { createContext, StrictMode, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "../ui/theme/fonts.css";
import "../ui/theme/tokens.css";
import "../ui/theme/base.css";
import { initLanguage, setLanguage, type Language } from "../i18n";
import { useLanguage } from "../i18n/react";
import { ShownProvider } from "../ui/runner/ShownContext";
import { createSettingsStore, type SettingsStore } from "../ui/state/settings";
import { UiRootProvider } from "../ui/state/UiRootProvider";
import { useUiRoot } from "../ui/state/context";
import type { LayoutKind } from "../ui/theme";
import type { UiSettings } from "../ui/ui-contract";
import { FixtureController, type FixtureControllerOptions } from "./FixtureController";
import type { Fixture } from "./fixtureFormat";
import { fixtureIndex, loadFixture } from "./fixtures";
import s from "./demo.module.css";

export interface DemoParams {
  scene: string | null;
  start: "begin" | "end" | undefined;
  view: LayoutKind | undefined;
  queued: FixtureControllerOptions["queued"];
  think: number;
  settings: Partial<UiSettings>;
}

const LAYOUTS: LayoutKind[] = ["desktop", "tablet", "compact", "compact-landscape"];

/** The demo's URL parameters (see the header). */
export function demoParams(search: string = typeof location === "undefined" ? "" : location.search): DemoParams {
  const q = new URLSearchParams(search);
  const settings: Partial<UiSettings> = {};
  const speed = q.get("speed");
  if (speed === "slow" || speed === "normal" || speed === "fast" || speed === "instant") settings.speed = speed;
  const motion = q.get("motion");
  if (motion === "system" || motion === "reduce" || motion === "full") settings.motion = motion;
  const labels = Number(q.get("labels"));
  if (labels === 115 || labels === 130) settings.mapLabels = labels;
  if (q.get("patterns") === "on") settings.patterns = true;
  if (q.get("pause") === "off") settings.pauseOnReveals = false;
  const start = q.get("start");
  const view = q.get("view") as LayoutKind | null;
  const queued = q.get("queued");
  return {
    scene: q.get("scene"),
    start: start === "begin" || start === "end" ? start : undefined,
    view: view && LAYOUTS.includes(view) ? view : undefined,
    queued: queued === "zero" || queued === "remaining" || queued === "recorded" ? queued : undefined,
    think: Math.max(0, Number(q.get("think")) || 0),
    settings,
  };
}

/** Load the language (honours ?lang=), then render `app` into #root. */
export async function bootDemo(app: () => ReactNode, rootId = "root"): Promise<void> {
  await initLanguage();
  const el = document.getElementById(rootId);
  if (!el) throw new Error(`#${rootId} not found`);
  createRoot(el).render(<StrictMode>{app()}</StrictMode>);
}

interface DemoCtx {
  controller: FixtureController;
  fixture: Fixture;
  settings: SettingsStore;
}
const DemoContext = createContext<DemoCtx | null>(null);

/** Inside <DemoHarness>: the fixture controller, the fixture and the settings store. */
export function useDemo(): DemoCtx {
  const c = useContext(DemoContext);
  if (!c) throw new Error("useDemo() used outside <DemoHarness>");
  return c;
}

export interface DemoHarnessProps {
  /** Fixture name (tests/fixtures/ui/index.json). `?scene=` in the URL wins. */
  scene?: string;
  /** A fixture already loaded (instead of `scene`). */
  fixture?: Fixture;
  /** Replay start; default: scenes at the end, sequences at the beginning (`?start=` wins). */
  start?: "begin" | "end";
  controllerOptions?: FixtureControllerOptions;
  /** Fixed arrangement (`?view=` wins); default from the viewport. */
  layout?: LayoutKind;
  /** Initial settings (URL parameters win). */
  settings?: Partial<UiSettings>;
  /** Called after each frame commit (e.g. map.clearOverrides()). */
  onCommit?: () => void;
  /** Shown while the fixture loads. */
  loading?: ReactNode;
  children?: ReactNode | ((demo: DemoCtx) => ReactNode);
}

export function DemoHarness(props: DemoHarnessProps) {
  const params = useMemo(() => demoParams(), []);
  const name = params.scene ?? props.scene ?? null;
  const [loaded, setLoaded] = useState<{ name: string; fixture: Fixture } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (props.fixture || !name) return;
    let live = true;
    loadFixture(name).then(f => { if (live) setLoaded({ name, fixture: f }); }, e => { if (live) setError(String(e)); });
    return () => { live = false; };
  }, [name, props.fixture]);
  const fixture = props.fixture ?? (loaded?.name === name ? loaded.fixture : null);
  const settingsKey = JSON.stringify({ ...props.settings, ...params.settings });
  const settings = useMemo(() => createSettingsStore(null, JSON.parse(settingsKey) as Partial<UiSettings>), [settingsKey]);
  // The controller is created and disposed by one effect, so StrictMode's simulated unmount disposes the instance it
  // made and its re-run makes a fresh one. (A useMemo'd controller survives that unmount: disposing it there cleared a
  // pending `think=` timer and left the replay "thinking" forever.) Options are read when the fixture changes.
  const [made, setMade] = useState<{ controller: FixtureController; fixture: Fixture } | null>(null);
  const optionsRef = useRef<FixtureControllerOptions>({});
  optionsRef.current = { start: params.start ?? props.start, queued: params.queued, aiThinkingMs: params.think || undefined, ...props.controllerOptions };
  useEffect(() => {
    if (!fixture) return;
    const c = new FixtureController(fixture, optionsRef.current);
    setMade({ controller: c, fixture });
    return () => {
      c.dispose();
      setMade(cur => (cur?.controller === c ? null : cur));
    };
  }, [fixture]);
  // Until the effect has made the controller for this fixture (the first render, a scene change), show the loading.
  const controller = made && made.fixture === fixture ? made.controller : null;
  if (error) return <pre className={s.error}>{error}</pre>;
  if (!name && !props.fixture) return <pre className={s.error}>{`?scene= missing (${fixtureIndex().map(r => r.name).join(", ")})`}</pre>;
  if (!fixture || !controller) return <>{props.loading ?? null}</>;
  const demo: DemoCtx = { controller, fixture, settings };
  return (
    <DemoContext.Provider value={demo}>
      <UiRootProvider controller={controller} settingsStore={settings} layout={params.view ?? props.layout}>
        <ShownProvider onCommit={props.onCommit}>
          {typeof props.children === "function" ? props.children(demo) : props.children}
        </ShownProvider>
      </UiRootProvider>
    </DemoContext.Provider>
  );
}

const LANGS: Language[] = ["en", "zh-CN", "en-XA"];

/**
 * A small dev toolbar (top right): scene picker, language, speed, motion, replay. Dev text, not
 * translated (it is never shipped).
 */
export function DemoToolbar(props: { extra?: ReactNode; /** In the flow instead of fixed at the top right. */ inline?: boolean }) {
  const { controller, fixture } = useDemo();
  const root = useUiRoot();
  const lang = useLanguage();
  const [pos, setPos] = useState(controller.position);
  useEffect(() => controller.subscribe(() => setPos(controller.position)), [controller]);
  const go = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams(location.search);
    for (const [k, v] of Object.entries(patch)) if (v === null) q.delete(k); else q.set(k, v);
    location.search = q.toString();
  };
  return (
    <div className={`${s.toolbar} ${props.inline ? s.inline : ""}`} data-dev="">
      <select value={fixture.name} onChange={e => go({ scene: e.target.value })} title={fixture.description}>
        {(["scene", "sequence"] as const).map(kind => (
          <optgroup key={kind} label={kind}>
            {fixtureIndex().filter(r => r.kind === kind).map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
          </optgroup>
        ))}
      </select>
      <span className={s.group}>
        {LANGS.map(l => (
          <button key={l} type="button" aria-pressed={lang === l} onClick={() => void setLanguage(l)}>{l}</button>
        ))}
      </span>
      <select value={root.settings.speed} onChange={e => root.setSettings({ speed: e.target.value as UiSettings["speed"] })} title="speed">
        {(["slow", "normal", "fast", "instant"] as const).map(v => <option key={v} value={v}>{v}</option>)}
      </select>
      <select value={root.settings.motion} onChange={e => root.setSettings({ motion: e.target.value as UiSettings["motion"] })} title="motion">
        {(["system", "reduce", "full"] as const).map(v => <option key={v} value={v}>{v}</option>)}
      </select>
      <button type="button" onClick={() => controller.restart("begin")} title="replay from the base frame">⟲</button>
      <button type="button" onClick={() => controller.restart("end")} title="jump to the end">⏭</button>
      <span className={s.pos}>{`${pos.index + 1}/${pos.count}${pos.done ? " ✓" : ""}`}</span>
      {props.extra}
    </div>
  );
}
