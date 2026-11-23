/**
 * The ☰ menu (ui-spec §11.3): New game (confirm) · Resign (hold) · Settings · Keyboard shortcuts ·
 * Rules (GMT living rules ↗) · About & credits; compact also the language. A popover under the ☰ on
 * desktop/tablet, a bottom sheet with 52 px rows on compact.
 *
 * Keyboard (WAI-ARIA menu button, Q-046): opening it focuses the first item once the popover is placed (it
 * stays hidden until then), ↑ ↓ Home End move between the items, Esc / Tab close it, and focus goes back to
 * the button it hangs from (or wherever focus was when it opened) unless a dialog it opened took focus.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useI18n } from "../../i18n/react";
import { Icon, type IconName } from "../common/Icon";
import { Popover } from "../common/Popover";
import { Sheet } from "../common/Sheet";
import { useTouchUi } from "../common/touch";
import { LangToggle } from "../console/LangToggle";
import { useUiRoot } from "../state/context";
import type { ShellDialog } from "./shellContext";
import s from "./dialogs.module.css";

export interface MenuProps {
  /** The ☰ button the popover hangs from (null on compact). */
  anchor: Element | null;
  onClose(): void;
  /** Open a shell dialog (the menu closes first). */
  onOpen(dialog: ShellDialog): void;
  /** Go to the start screen for a new game without asking (the game is over). */
  onNewGameNow(): void;
}

/** The item to focus for a menu key, from the current one (`at`, −1 = none) among `n` items; null = not a move. */
export function menuMove(key: string, at: number, n: number): number | null {
  if (!n) return null;
  switch (key) {
    case "ArrowDown": return at < 0 ? 0 : (at + 1) % n;
    case "ArrowUp": return at < 0 ? n - 1 : (at - 1 + n) % n;
    case "Home": return 0;
    case "End": return n - 1;
    default: return null;
  }
}

export function Menu({ anchor, onClose, onOpen, onNewGameNow }: MenuProps) {
  const root = useUiRoot();
  const { t } = useI18n();
  const compact = root.layout === "compact" || root.layout === "compact-landscape";
  const playing = root.vm.status === "playing";
  // Touch screens have no keys to hint at (ui-spec §3.3 as built, Q-032; R-011).
  const touch = useTouchUi();
  const list = useRef<HTMLDivElement | null>(null);
  // Where focus goes back on close: the ☰ (or wordmark) the popover hangs from, else what had focus.
  const [opener] = useState<Element | null>(() => anchor ?? (typeof document === "undefined" ? null : document.activeElement));

  // Focus the first item as soon as the popover is visible (it is placed, then shown, after mounting).
  useEffect(() => {
    if (compact) return;
    let raf = 0;
    let tries = 0;
    const go = () => {
      const first = list.current?.querySelector<HTMLElement>("[role=menuitem]:not(:disabled)");
      first?.focus({ preventScroll: true });
      if ((!first || document.activeElement !== first) && ++tries < 20) raf = requestAnimationFrame(go);
    };
    go();
    return () => cancelAnimationFrame(raf);
  }, [compact]);

  // Closing: give focus back to the opener when it was lost with the menu (not when a dialog took it).
  useEffect(() => {
    const node = list.current;
    return () => {
      if (compact) return;
      const a = document.activeElement;
      const lost = !a || a === document.body || (node?.contains(a) ?? false);
      if (lost && opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [compact, opener]);

  const pick = (d: ShellDialog) => { onClose(); onOpen(d); };
  const item = (icon: IconName | null, label: string, onClick: () => void, opts: { danger?: boolean; disabled?: boolean; kbd?: string } = {}) => (
    <button
      type="button"
      role="menuitem"
      className={[s.menuItem, opts.danger ? s.danger : ""].filter(Boolean).join(" ")}
      disabled={opts.disabled}
      tabIndex={compact ? undefined : -1}
      onClick={onClick}
    >
      {icon ? <Icon name={icon} /> : <span style={{ width: 16 }} aria-hidden="true" />}
      <span>{label}</span>
      {opts.kbd && !touch ? <kbd aria-hidden="true">{opts.kbd}</kbd> : null}
    </button>
  );
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Tab" && !compact) {
      // A menu is one stop: Tab leaves it (closing it; focus returns to the ☰).
      e.preventDefault();
      onClose();
      return;
    }
    const items = [...(list.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not(:disabled)") ?? [])];
    const next = menuMove(e.key, items.indexOf(document.activeElement as HTMLElement), items.length);
    if (next === null) return;
    e.preventDefault();
    items[next]?.focus();
  };

  const body = (
    // The popover itself is the menu (role and name); on compact the sheet is a dialog holding it.
    <div className={s.menu} role={compact ? "menu" : undefined} aria-label={compact ? t("ui:game.menu") : undefined} ref={list} onKeyDown={onKey}>
      {item("menu", t("ui:menu.newGame"), () => (playing ? pick("newGame") : (onClose(), onNewGameNow())))}
      {item("close", t("ui:game.resign"), () => pick("resign"), { danger: true, disabled: !playing })}
      <div className={s.sep} role="separator" />
      {item("gear", t("ui:menu.settings"), () => pick("settings"))}
      {compact ? null : item("list", t("ui:shortcuts.title"), () => pick("shortcuts"), { kbd: "?" })}
      <a
        role="menuitem"
        className={s.menuItem}
        href={t("ui:links.rules")}
        target="_blank"
        rel="noopener noreferrer"
        title={t("ui:menu.rulesTitle")}
        tabIndex={compact ? undefined : -1}
        onClick={onClose}
      >
        <Icon name="log" />
        <span>{t("ui:start.rules")}</span>
        <Icon name="external" className={s.ext} size={13} />
      </a>
      {item("eye", t("ui_shell:menu.about"), () => pick("about"))}
    </div>
  );

  if (compact) {
    return (
      <Sheet open onClose={onClose} height="auto" label={t("ui:game.menu")} className={s.sheetMenu}>
        {body}
        <div className={s.sep} role="separator" />
        <div className={s.menuLang}>
          <span>{t("ui:settings.language")}</span>
          <LangToggle variant="segmented" className={s.menuLangToggle} />
        </div>
      </Sheet>
    );
  }
  return (
    <Popover anchor={anchor} placement="bottom" tone="room" role="menu" label={t("ui:game.menu")} onClose={onClose}>
      {body}
    </Popover>
  );
}
