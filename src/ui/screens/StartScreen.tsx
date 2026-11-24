/**
 * The start screen (ui-spec §11.1, `final-start.png`): the dark wall over the real map on a table in
 * perspective, the title, three side dossiers (one click starts), Resume / Rules / Settings, the rule
 * chips, the boot line and the fine print. Compact: everything stacks and the screen scrolls.
 */
import { Suspense, useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { LoadProgress, Side, SideChoice } from "../../game/contract";
import { useI18n } from "../../i18n/react";
import { Icon } from "../common/Icon";
import { Seal } from "../common/Seal";
import { LangToggle } from "../console/LangToggle";
import { useReducedMotion } from "../state";
import { useUiRoot } from "../state/context";
import { BootLine } from "./BootLine";
import { gameChunk, mapChunk, useChunk, whenIdle } from "./lazyChunks";
import type { CoinState } from "./shellContext";
import s from "./StartScreen.module.css";

/** How long the coin of a random side spins before it lands (ui-spec §11.1). */
export const COIN_MS = 900;

export interface StartScreenProps {
  /** The random side's coin: spinning ("toss"), landed on a side, or idle. */
  coin: CoinState;
  /** Ask "This replaces your saved game" before a side choice (not when the player already confirmed). */
  confirmReplace: boolean;
  /** A game is running behind the start screen: Resume goes back to it. */
  inGame: boolean;
  onPick(side: SideChoice): void;
  onResume(): void;
  onSettings(): void;
  onAbout(): void;
  /** The boot line's Retry after a failed load (default: reload the page). */
  onRetry?(): void;
}

const PICKS: readonly SideChoice[] = ["US", "random", "USSR"];

/** Why an unfinished save was discarded at boot (`ViewModel.incompatibleSave`; `reason` is optional, R-018). */
export interface DiscardedSave {
  savedAt: number;
  reason?: "build" | "unreadable";
}

/**
 * The toast for a save discarded at boot (Q-014, R-018): "could not be read (changed or damaged)" for an unreadable
 * save -- `reason: "unreadable"`, or no `reason` and `savedAt` 0, the controller's convention before the field --,
 * else "made with another version of the engine or AI".
 */
export function discardedSaveKey(save: DiscardedSave): "ui_shell:error.saveUnreadable" | "ui:error.saveIncompatible" {
  const unreadable = save.reason ? save.reason === "unreadable" : save.savedAt === 0;
  return unreadable ? "ui_shell:error.saveUnreadable" : "ui:error.saveIncompatible";
}

/** "2 h ago" in the page language. */
export function agoText(lang: string, savedAt: number, now = Date.now()): string {
  const rtf = new Intl.RelativeTimeFormat(lang.startsWith("zh") ? "zh-CN" : "en", { numeric: "auto", style: "short" });
  const sec = Math.round((savedAt - now) / 1000);
  const abs = Math.abs(sec);
  if (abs < 60) return rtf.format(0, "minute");
  if (abs < 3600) return rtf.format(Math.round(sec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(sec / 3600), "hour");
  return rtf.format(Math.round(sec / 86400), "day");
}

/**
 * Whether the AI has loaded -- the controller's own fact (`vm.aiReady`), so a start screen mounted again after a game
 * reads Ready (QA L-1: a per-mount "progress seen" flag left it at "AI MODEL", 15 %, with the first-visit note) -- and
 * the load stage seen last (it names the failed stage when an error leaves none in `vm.load`).
 */
function useAiReady(load: LoadProgress | undefined, aiReady: boolean | undefined): { ready: boolean; lastStage: LoadProgress["stage"] | null } {
  const last = useRef<LoadProgress["stage"] | null>(null);
  if (load) last.current = load.stage;
  return { ready: !!aiReady, lastStage: last.current };
}

export function StartScreen({ coin, confirmReplace, inGame, onPick, onResume, onSettings, onAbout, onRetry }: StartScreenProps) {
  const root = useUiRoot();
  const { t, lang } = useI18n();
  const reduced = useReducedMotion();
  const vm = root.vm;
  const compact = root.layout === "compact" || root.layout === "compact-landscape";
  const engineReady = vm.status === "menu" || vm.status === "playing" || vm.status === "over";
  const busy = coin !== null;
  const [asking, setAsking] = useState<SideChoice | null>(null);
  const ai = useAiReady(vm.load, vm.aiReady);
  const folders = useRef<(HTMLButtonElement | null)[]>([]);
  // The map backdrop is its own chunk (it fades in); the game chunk downloads once the page is idle.
  const mapReady = useChunk(mapChunk);
  useEffect(() => whenIdle(() => { gameChunk.load().catch(() => { /* retried when a game starts */ }); }), []);

  const saved = vm.savedGame;
  const canResume = inGame || vm.hasSavedGame;
  const pick = (side: SideChoice) => {
    if (!engineReady || busy) return;
    if (confirmReplace && vm.hasSavedGame && !inGame) {
      setAsking(side);
      return;
    }
    onPick(side);
  };
  useEffect(() => { if (!vm.hasSavedGame) setAsking(null); }, [vm.hasSavedGame]);
  // An unfinished save that cannot be resumed was found at boot and discarded (Q-014): say so once, and why
  // (another engine build, or changed / damaged: R-018).
  const discarded: DiscardedSave | undefined = vm.incompatibleSave;
  const incompatibleAt = discarded?.savedAt;
  const discardedKey = discarded ? discardedSaveKey(discarded) : null;
  const toldIncompatible = useRef<number | null>(null);
  useEffect(() => {
    if (incompatibleAt === undefined || !discardedKey || toldIncompatible.current === incompatibleAt) return;
    toldIncompatible.current = incompatibleAt;
    root.toast(t(discardedKey), { tone: "warn" });
  }, [incompatibleAt, discardedKey, root, t]);

  const onFolderKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys = compact ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight"];
    const dir = e.key === keys[0] ? -1 : e.key === keys[1] ? 1 : 0;
    if (!dir) return;
    e.preventDefault();
    const order = compact ? (["US", "USSR", "random"] as const) : PICKS;
    const at = order.findIndex(p => folders.current[PICKS.indexOf(p)] === document.activeElement);
    const next = order[(at + dir + order.length) % order.length]!;
    folders.current[PICKS.indexOf(next)]?.focus();
  };

  const resumeSub = saved
    ? t(saved.ar > 0 ? "ui:start.resumeDetail" : "ui:start.resumeDetailHeadline", {
      turn: saved.turn, ar: saved.ar, side: t(`ui:side.${saved.humanSide}`), ago: agoText(lang, saved.savedAt),
    })
    : null;
  const resumeButton = canResume ? (
    <button type="button" className={s.resume} onClick={onResume} disabled={!engineReady || busy}>
      <span className={s.resumeTitle}>
        <span aria-hidden="true">▶</span> {t("ui:start.resume")}
      </span>
      {resumeSub && !inGame ? <small>{resumeSub}</small> : null}
    </button>
  ) : null;

  return (
    <div className={[s.start, compact ? s.compact : "", root.layout === "compact-landscape" ? s.landscape : "", reduced ? s.reduced : "", vm.status === "error" ? s.failed : ""].filter(Boolean).join(" ")} data-layout={root.layout}>
      {/* The backdrop map is scenery: inert, so its boxes are no Tab stops and pop no tooltips (Q-051). */}
      <div className={s.wall} aria-hidden="true" {...INERT}>
        <div className={s.tableTop}>
          <div className={s.drift}>
            {mapReady ? (
              <Suspense fallback={null}>
                <div className={s.mapIn}>
                  <mapChunk.Component
                    state={null} regionScores={null} humanSide="US" layout="desktop" targets={null} regionTargets={null}
                    selection={null} placed={EMPTY} lastOpponent={EMPTY_OPP} focusRegion={null} interactive={false}
                    labelScale={1} patterns={false} controls={false} flashChanges={false}
                  />
                </div>
              </Suspense>
            ) : null}
          </div>
        </div>
        <div className={s.lampPool} />
        <div className={s.vignette} />
        <div className={s.lampCone} />
      </div>

      <div className={s.scroll}>
        <header className={s.top}>
          <span className={s.classified}>{t("ui:start.classified")}</span>
          <div className={s.topActions}>
            <LangToggle variant="segmented" />
            <button type="button" className={s.iconBtn} aria-label={t("ui:menu.settings")} title={t("ui:menu.settings")} onClick={onSettings}>
              <Icon name="gear" size={17} />
            </button>
          </div>
        </header>

        <main className={s.center}>
          <div className={s.kicker}>{t("ui:start.kicker")}</div>
          <h1 className={s.title} lang="en">
            <span>{t("ui:start.titleLine1")}</span>
            <span>{t("ui:start.titleLine2")}</span>
          </h1>
          <div className={s.zhTitle} lang="zh-CN">{t("ui:start.titleZh")}</div>
          <p className={s.tagline}>{t("ui:start.tagline")}</p>

          {compact && resumeButton ? <div className={s.row}>{resumeButton}</div> : null}

          <div className={s.sides} role="group" aria-label={t("ui:menu.chooseSide")} onKeyDown={onFolderKey}>
            {PICKS.map((p, i) => (
              <button
                key={p}
                ref={el => { folders.current[i] = el; }}
                type="button"
                className={[s.folder, s[`f_${p}`], asking === p ? s.asking : ""].filter(Boolean).join(" ")}
                onClick={() => pick(p)}
                disabled={!engineReady || busy}
                aria-describedby={`ts-pick-${p}`}
              >
                {p === "random" ? <Coin coin={coin} reduced={reduced} /> : <Seal side={p} size={compact ? 40 : 54} className={s.seal} />}
                {p !== "random" ? <span className={s.stampx} aria-hidden="true">{t(`ui:start.stamp.${p}`)}</span> : null}
                <span className={s.folderText}>
                  <span className={s.nm}>{t(`ui:start.pick.${p}`)}</span>
                  <span className={s.ds} id={`ts-pick-${p}`}>{t(`ui:start.pickDesc.${p}`)}</span>
                  {compact ? null : <span className={s.go}>{t("ui:start.take")} <span aria-hidden="true">→</span></span>}
                </span>
                {compact ? <span className={s.chev} aria-hidden="true">›</span> : null}
              </button>
            ))}
          </div>

          {asking ? (
            <div className={s.replace} role="alertdialog" aria-label={t("ui:start.replaces")}>
              <span>{t("ui:start.replaces")}</span>
              <button type="button" className={s.btnBrass} autoFocus onClick={() => { const p = asking; setAsking(null); onPick(p); }}>
                {t("ui:start.startNew")}
              </button>
              <button type="button" className={s.btnDark} onClick={() => setAsking(null)}>{t("ui:action.cancel")}</button>
            </div>
          ) : (
            <div className={s.row}>
              {compact ? null : resumeButton}
              <a className={s.btnDark} href={t("ui:links.rules")} target="_blank" rel="noopener noreferrer" title={t("ui:menu.rulesTitle")}>
                {t("ui:start.rules")} <Icon name="external" size={13} />
              </a>
              <button type="button" className={s.btnDark} onClick={onSettings}>{t("ui:menu.settings")}</button>
            </div>
          )}

          <ul className={s.chips} aria-label={t("ui:about.rulesVariant")}>
            <li>{t("ui:start.chips.standard")}</li>
            <li>{t("ui:start.chips.bid")}</li>
            <li>{t("ui:start.chips.tournament")}</li>
            <li>{t("ui:start.chips.ai")}</li>
          </ul>
        </main>

        <footer className={s.foot}>
          <BootLine
            className={s.boot}
            status={vm.status}
            load={vm.load}
            error={vm.error}
            aiReady={ai.ready}
            failedStage={ai.lastStage}
            onRetry={onRetry ?? (() => window.location.reload())}
          />
          <div className={s.fine}>
            <span>{t("ui:start.fine")}</span>
            <span>
              {t("ui:start.fineEngine")}{" "}
              <button type="button" className={s.link} onClick={onAbout}>{t("ui:start.credits")}</button>
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}

/** React 18 does not know `inert`; an empty string sets the attribute. */
const INERT = { inert: "" } as object;

const EMPTY: Readonly<Record<number, number>> = {};
const EMPTY_OPP: Readonly<Record<number, { us: number; ussr: number }>> = {};

/** The coin of "Toss a coin": half blue, half red; spins while the side is drawn, lands on its seal. */
function Coin({ coin, reduced }: { coin: CoinState; reduced: boolean }) {
  const { t } = useI18n();
  if (coin === "US" || coin === "USSR") {
    return (
      <span className={[s.coinWrap, reduced ? "" : s.coinLand].filter(Boolean).join(" ")} role="status" aria-label={t(`ui:side.long.${coin as Side}`)}>
        <Seal side={coin} size={54} className={s.seal} />
      </span>
    );
  }
  return (
    <span className={[s.coinWrap, coin === "toss" && !reduced ? s.coinSpin : ""].filter(Boolean).join(" ")} aria-hidden="true">
      <svg className={s.coin} viewBox="0 0 48 48" width={54} height={54} focusable="false">
        <circle className={s.coinRim} cx="24" cy="24" r="22" strokeWidth="2" />
        <circle className={s.coinRing} cx="24" cy="24" r="17" fill="none" strokeDasharray="2 2" />
        <path className={s.coinUssr} d="M24 24 L24 6 A18 18 0 0 1 24 42 Z" />
        <path className={s.coinUs} d="M24 24 L24 6 A18 18 0 0 0 24 42 Z" />
      </svg>
    </span>
  );
}
