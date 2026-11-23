/**
 * Toasts (ui-spec §3.5 z toast; final.css `.toast`): a queue at the top centre of the table. Items come
 * from the provider's overlay state (`UiRoot.toast()` adds them); each stays `ms` (3 s default, paused
 * while hovered or focused), fades out, then is dismissed. "warn" toasts carry the hazard stripe and ⚠.
 * The list is a polite live region. Place <Toaster/> inside the table container (absolute), or pass
 * `fixed` to pin it to the viewport.
 */
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n/react";
import { useOverlays, useUiRoot, type ToastItem } from "../state/context";
import type { UiRoot } from "../ui-contract";
import { TIMING } from "../theme/motion";
import { Icon } from "./Icon";
import s from "./Toaster.module.css";

/** `UiRoot.toast`: show a toast. */
export function useToast(): UiRoot["toast"] {
  return useUiRoot().toast;
}

export interface ToasterProps {
  /** Pin to the viewport instead of the nearest positioned container. */
  fixed?: boolean;
}

export function Toaster({ fixed = false }: ToasterProps) {
  const { t } = useI18n();
  const { toasts, dismissToast } = useOverlays();
  return (
    <div className={[s.toaster, fixed ? s.fixed : ""].join(" ")} role="status" aria-live="polite" aria-label={t("ui_common:toast.region")}>
      {toasts.map(item => <Toast key={item.id} item={item} onDismiss={dismissToast} closeLabel={t("ui:action.close")} />)}
    </div>
  );
}

function Toast({ item, onDismiss, closeLabel }: { item: ToastItem; onDismiss(id: number): void; closeLabel: string }) {
  const [leaving, setLeaving] = useState(false);
  const [paused, setPaused] = useState(false);
  const remaining = useRef(item.ms > 0 ? item.ms : TIMING.toast.default);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  // Countdown (paused while hovered / focused), then fade out, then dismiss.
  useEffect(() => {
    if (paused || leaving) return;
    const started = Date.now();
    const id = setTimeout(() => setLeaving(true), Math.max(0, remaining.current - TIMING.toast.out));
    return () => {
      clearTimeout(id);
      remaining.current = Math.max(TIMING.toast.out, remaining.current - (Date.now() - started));
    };
  }, [paused, leaving]);
  useEffect(() => {
    if (!leaving) return;
    const id = setTimeout(() => dismiss.current(item.id), TIMING.toast.out);
    return () => clearTimeout(id);
  }, [leaving, item.id]);

  const warn = item.tone === "warn";
  return (
    <div
      className={[s.toast, warn ? s.warn : s.info, leaving ? s.leaving : ""].join(" ")}
      data-tone={item.tone}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {warn ? <span className={s.hazard} aria-hidden="true" /> : null}
      <span className={s.msg}>{item.message}</span>
      <button type="button" className={s.close} aria-label={closeLabel} onClick={() => setLeaving(true)}>
        <Icon name="close" />
      </button>
    </div>
  );
}
