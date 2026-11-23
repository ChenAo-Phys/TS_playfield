/**
 * The app (ui-spec §15.3 W1): one controller, the providers, and the route by `vm.status`:
 * boot / loading / menu / error → StartScreen; playing / over → GameScreen. The start screen also
 * shows while the player picks a side for a new game from inside a game, and while the coin of a
 * random side lands.
 *
 *   <KeymapProvider>                       one keymap for the whole app (src/ui/common/keymap.ts)
 *     <UiRootProvider controller>          vm, settings, layout, anchors, director, toasts, zoom
 *       <ShownProvider>                    the frame runner (above both screens: it keeps acking)
 *         <ShellContext> StartScreen | GameScreen + the shell's dialogs
 *
 * The game screen is its own chunk (`./screens/lazyChunks`): the start screen preloads it when idle, and
 * the app keeps the start screen up until it is in (it never shows a loading fallback).
 */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameController, SideChoice } from "../game/contract";
import { useI18n } from "../i18n/react";
import { KeymapProvider, useKey } from "./common/keymap";
import { Toaster } from "./common/Toaster";
import { ShownProvider } from "./runner/ShownContext";
import { AboutDossier } from "./screens/AboutDossier";
import { appController } from "./screens/appController";
import { ConfirmDossier } from "./screens/ConfirmDossier";
import { gameChunk, useChunk } from "./screens/lazyChunks";
import { SettingsDossier } from "./screens/SettingsDossier";
import { ShellContext, type CoinState, type ShellActions, type ShellDialog } from "./screens/shellContext";
import { ShortcutsSheet } from "./screens/ShortcutsSheet";
import { StartScreen, COIN_MS } from "./screens/StartScreen";
import { SupersededDossier } from "./screens/SupersededDossier";
import { useReducedMotion } from "./state";
import { UiRootProvider } from "./state/UiRootProvider";
import { useUiRoot } from "./state/context";

/**
 * The boot line's Retry (K-001): before any game (`humanSide` null) the controller loads the engine / the AI
 * again in place; a failure in the middle of a game reloads the page, which resumes from the autosave.
 */
export function retryBoot(controller: Pick<GameController, "boot">, humanSide: string | null | undefined, reload: () => void = () => window.location.reload()): void {
  if (humanSide) reload();
  else controller.boot().catch(() => { /* reported as status "error" again */ });
}

export interface AppProps {
  /** The controller (default: the page's, created once). Tests and demos pass their own. */
  controller?: GameController;
}

export function App({ controller }: AppProps) {
  const c = useMemo(() => controller ?? appController(), [controller]);
  useEffect(() => {
    c.boot().catch(() => { /* the controller reports it as status "error" */ });
  }, [c]);
  return (
    <KeymapProvider>
      <UiRootProvider controller={c}>
        <ShownProvider>
          <Screens />
        </ShownProvider>
      </UiRootProvider>
    </KeymapProvider>
  );
}

function Screens() {
  const root = useUiRoot();
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const vm = root.vm;
  const controller = root.controller;
  /** "start": the player left the game for the start screen; `abandon`: the replace was confirmed. */
  const [view, setView] = useState<{ start: boolean; abandon: boolean }>({ start: false, abandon: false });
  const [coin, setCoin] = useState<CoinState>(null);
  const [dialog, setDialog] = useState<ShellDialog | null>(null);
  const [gameKey, setGameKey] = useState(0);
  const [telexKey, setTelexKey] = useState(0);
  const coinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (coinTimer.current) clearTimeout(coinTimer.current); }, []);

  const inGame = vm.status === "playing" || vm.status === "over";
  // The game chunk (normally preloaded by the start screen while idle): a failed download keeps the start
  // screen with one warning (Q-055: the toast comes from the player's action only, never twice for one
  // click); Resume / a side choice retries it, and while a game waits for it the download is retried quietly.
  const gameReady = useChunk(gameChunk, inGame);
  const retryChunk = useCallback(() => {
    if (!gameChunk.loaded()) gameChunk.load().catch(() => root.toast(t("ui_shell:error.gameChunk"), { tone: "warn" }));
  }, [root, t]);
  const onRetry = useCallback(() => retryBoot(controller, vm.humanSide), [controller, vm.humanSide]);
  const showStart = !inGame || view.start || coin !== null || !gameReady;

  const startGame = useCallback(async (side: SideChoice) => {
    setDialog(null);
    retryChunk();
    setGameKey(k => k + 1);
    if (side === "random") setCoin("toss");
    try {
      await controller.newGame({ side });
    } catch {
      setCoin(null);
      return;
    }
    setView({ start: false, abandon: false });
    if (side === "random") {
      const drawn = controller.getSnapshot().humanSide;
      setCoin(drawn);
      if (coinTimer.current) clearTimeout(coinTimer.current);
      coinTimer.current = setTimeout(() => setCoin(null), reduced ? 0 : COIN_MS + 350);
    }
  }, [controller, reduced, retryChunk]);

  const resume = useCallback(async () => {
    setDialog(null);
    retryChunk();
    if (vm.status === "playing") {
      // Back from the start screen to the game that is still running.
      setView({ start: false, abandon: false });
      return;
    }
    setGameKey(k => k + 1);
    const ok = await controller.resume().catch(() => false);
    // After boot, a refused resume is a save that no longer reads or replays (a save of another build was
    // already discarded at boot): R-018.
    if (!ok) root.toast(t("ui_shell:error.saveUnreadable"), { tone: "warn" });
    setView({ start: false, abandon: false });
  }, [controller, vm.status, root, t, retryChunk]);

  const shell = useMemo<ShellActions>(() => ({
    open: d => setDialog(d),
    toStart: () => { setDialog(null); setView({ start: true, abandon: true }); },
    showResult: () => setTelexKey(k => k + 1),
    gameKey,
    telexKey,
  }), [gameKey, telexKey]);

  // Resign once the confirmation has closed and handed focus back to its opener (passive cleanups run before
  // this effect): the game-over telex that the resignation opens then takes focus and keeps it (Q-043).
  const [resigning, setResigning] = useState(false);
  useEffect(() => {
    if (!resigning || dialog !== null) return;
    setResigning(false);
    controller.resign();
  }, [resigning, dialog, controller]);

  // "?" opens the shortcut sheet anywhere (a dialog's own scope still wins).
  useKey("?", () => setDialog(d => (d === "shortcuts" ? null : "shortcuts")));

  const close = () => setDialog(null);
  return (
    <ShellContext.Provider value={shell}>
      {showStart ? <Toaster fixed /> : null}
      {showStart ? (
        <StartScreen
          coin={coin}
          confirmReplace={!view.abandon}
          inGame={vm.status === "playing"}
          onPick={side => void startGame(side)}
          onResume={() => void resume()}
          onSettings={() => setDialog("settings")}
          onAbout={() => setDialog("about")}
          onRetry={onRetry}
        />
      ) : (
        // Mounted only once the chunk is in, so this never suspends (the boundary is a safety net).
        <Suspense fallback={null}>
          <gameChunk.Component key={gameKey} />
        </Suspense>
      )}
      {/* Another tab took this saved game over (Q-002): the controller takes no more moves here, so a blocking
          notice with Reload replaces every other dialog. */}
      {vm.superseded ? <SupersededDossier /> : null}
      {!vm.superseded && dialog === "settings" ? <SettingsDossier onClose={close} /> : null}
      {!vm.superseded && dialog === "about" ? <AboutDossier onClose={close} /> : null}
      {!vm.superseded && dialog === "shortcuts" ? <ShortcutsSheet onClose={close} /> : null}
      {!vm.superseded && dialog === "newGame" ? (
        <ConfirmDossier kind="newGame" onClose={close} onConfirm={() => shell.toStart()} />
      ) : null}
      {!vm.superseded && dialog === "resign" ? (
        <ConfirmDossier kind="resign" onClose={close} onConfirm={() => { close(); setResigning(true); }} />
      ) : null}
    </ShellContext.Provider>
  );
}
