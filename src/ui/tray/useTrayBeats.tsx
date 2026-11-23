/**
 * React side of the tray beats (ui-spec §15.3 `useTrayBeats(director, humanSide)`):
 *
 *   const store = useTrayBeats(root.director, vm.humanSide);   // registers the handlers once
 *   <TrayBeatsProvider>…</TrayBeatsProvider>                   // the same, shared with Tray / HandDrawer
 *
 * `Tray` and `HandDrawer` use the nearest provider, and mount their own when there is none, so the
 * handlers always run while either is mounted. The shell may wrap the whole game screen in one
 * `<TrayBeatsProvider>` so the beats (and the China toast) also run while the compact drawer is closed.
 * Overrides are dropped on every commit (`useOnCommit`).
 */
import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import type { Side } from "../../game/contract";
import { useI18n } from "../../i18n/react";
import { useOnCommit } from "../runner/ShownContext";
import { UiRootContext } from "../state/context";
import { isReducedMotion, systemPrefersReducedMotion } from "../state/useReducedMotion";
import type { Director } from "../ui-contract";
import { NO_OVERRIDES, registerTrayBeats, TrayStore, type TrayOverrides } from "./trayBeats";

export const TrayStoreContext = createContext<TrayStore | null>(null);

/** Register the tray's beat handlers (reveal, hand-revealed, headline-chosen, china, deck pulse) on `director`. */
export function useTrayBeats(director: Director, humanSide: Side | null): TrayStore {
  const store = useMemo(() => new TrayStore(), []);
  const root = useContext(UiRootContext);
  const { t } = useI18n();
  const live = useRef({ root, t, humanSide });
  live.current = { root, t, humanSide };
  useOnCommit(() => store.reset());
  useEffect(() => {
    const anchors = live.current.root?.anchors ?? { ref: () => () => undefined, rect: () => null };
    return registerTrayBeats({
      director,
      store,
      anchors,
      humanSide: () => live.current.humanSide,
      reduced: () => isReducedMotion(live.current.root?.settings.motion ?? "system", systemPrefersReducedMotion()),
      toast: (message, ms) => live.current.root?.toast(message, { ms }),
      chinaToast: holder => live.current.t("ui:toast.china", { side: live.current.t(holder === "US" ? "ui:side.long.US" : "ui:side.long.USSR") }),
    });
  }, [director, store]);
  return store;
}

/** Runs the tray beats and shares their overrides with every Tray / HandDrawer inside. */
export function TrayBeatsProvider({ children, humanSide }: { children?: ReactNode; /** Default: `vm.humanSide`. */ humanSide?: Side | null }) {
  const root = useContext(UiRootContext);
  if (!root) return <>{children}</>;
  return <TrayBeatsRoot director={root.director} humanSide={humanSide ?? root.vm.humanSide}>{children}</TrayBeatsRoot>;
}

function TrayBeatsRoot({ director, humanSide, children }: { director: Director; humanSide: Side | null; children?: ReactNode }) {
  const store = useTrayBeats(director, humanSide);
  return <TrayStoreContext.Provider value={store}>{children}</TrayStoreContext.Provider>;
}

/** Wrap `children` in a TrayBeatsProvider unless one is already above. */
export function WithTrayBeats({ children }: { children: ReactNode }) {
  const store = useContext(TrayStoreContext);
  return store ? <>{children}</> : <TrayBeatsProvider>{children}</TrayBeatsProvider>;
}

const subscribeNone = () => () => undefined;
const getNone = () => NO_OVERRIDES;

/** The current overrides of the nearest tray store (none outside a provider). */
export function useTrayOverrides(): TrayOverrides {
  const store = useContext(TrayStoreContext);
  return useSyncExternalStore(store?.subscribe ?? subscribeNone, store?.get ?? getNone, store?.get ?? getNone);
}

/** The nearest tray store (element refs for the beat animations), or null. */
export function useTrayStore(): TrayStore | null {
  return useContext(TrayStoreContext);
}
