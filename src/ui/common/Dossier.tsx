/**
 * A modal dossier (ui-spec §3.5 z modal; final.css `.dossier`; `situation-room-card-picker.png`): a manila
 * folder with a tab, a paper sheet inside, an optional footer of buttons, over a scrim. role="dialog",
 * aria-modal, focus moves in and is trapped, Esc closes (when `onClose` is given) and focus returns to
 * the opener. On compact layouts it becomes a full-screen sheet.
 */
import { useContext, useEffect, useId, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../i18n/react";
import { UiRootContext } from "../state/context";
import { Icon } from "./Icon";
import { KeyScope } from "./keymap";
import s from "./Dossier.module.css";

export interface DossierProps {
  tab: ReactNode;
  title: ReactNode;
  /** Panel width in CSS px on desktop/tablet (default 640). */
  width?: number;
  /** Close / cancel; without it the dossier can only be left through its own buttons. */
  onClose?(): void;
  children: ReactNode;
  footer?: ReactNode;
  // ── extensions ──
  /** Force the full-screen sheet (default: when the UiRoot layout is compact / compact-landscape). */
  compact?: boolean;
  className?: string;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keep Tab / Shift+Tab inside `root` (a focus trap). */
export function trapTab(e: KeyboardEvent<HTMLElement>, root: HTMLElement | null): void {
  if (e.key !== "Tab" || !root) return;
  const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => el.offsetParent !== null || el === document.activeElement);
  if (!items.length) {
    e.preventDefault();
    root.focus();
    return;
  }
  const first = items[0]!, last = items[items.length - 1]!;
  const active = document.activeElement;
  if (e.shiftKey && (active === first || active === root)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}

/**
 * Remember the focused element now; on unmount, give focus back to it (if it is still there) -- but only when focus
 * was lost with the closing dialog (nothing or `<body>` has it, or it is still inside `within`). A dialog that opens
 * in the same commit and focused itself keeps focus (e.g. the resign confirmation closing as the telex opens).
 */
export function useFocusReturn(active = true, within?: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    const opener = document.activeElement as HTMLElement | null;
    const box = within?.current ?? null;
    return () => {
      const now = document.activeElement;
      const lost = !now || now === document.body || now === document.documentElement || !now.isConnected
        || (box !== null && box.contains(now));
      if (lost && opener && opener.isConnected && typeof opener.focus === "function") opener.focus({ preventScroll: true });
    };
  }, [active]); // `within` is a ref: read once, when the dialog opens
}

export function Dossier({ tab, title, width = 640, onClose, children, footer, compact, className }: DossierProps) {
  const { t } = useI18n();
  const root = useContext(UiRootContext);
  const full = compact ?? (root ? root.layout === "compact" || root.layout === "compact-landscape" : false);
  const titleId = useId();
  const panel = useRef<HTMLDivElement | null>(null);
  useFocusReturn(true, panel);

  // Focus the first control that is not the close button, else the panel.
  useEffect(() => {
    const p = panel.current;
    if (!p) return;
    const first = [...p.querySelectorAll<HTMLElement>(FOCUSABLE)].find(el => !el.dataset.dossierClose);
    (first ?? p).focus({ preventScroll: true });
  }, []);

  const body = (
    <KeyScope modal onEscape={onClose}>
      <div
        className={[s.scrim, full ? s.full : ""].join(" ")}
        onPointerDown={e => { if (e.target === e.currentTarget && onClose) onClose(); }}
      >
        <div
          ref={panel}
          className={[s.folder, className].filter(Boolean).join(" ")}
          style={full ? undefined : { width: `min(${width}px, calc(100vw - 32px))` }}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          onKeyDown={e => trapTab(e, panel.current)}
        >
          <div className={s.tab}>{tab}</div>
          {onClose ? (
            <button type="button" className={s.close} data-dossier-close="1" aria-label={t("ui:action.close")} onClick={onClose}>
              <Icon name="close" />
            </button>
          ) : null}
          <div className={`${s.sheet} ts-on-paper`}>
            <h2 id={titleId} className={s.title}>{title}</h2>
            <div className={s.body}>{children}</div>
            {footer ? <div className={s.footer}>{footer}</div> : null}
          </div>
        </div>
      </div>
    </KeyScope>
  );
  if (typeof document === "undefined") return body;
  return createPortal(body, document.body);
}
