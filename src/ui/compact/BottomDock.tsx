/**
 * The compact bottom dock (ui-spec §3.3): Hand (three stacked thumbnails, "HAND · n", chevron) ·
 * Adversary (AI seal + hand count) · Log (unread count) · Status. Each opens its sheet. While a sheet is
 * closed its button stands in for the anchors that live inside it (deal flights, the AI's cards, the
 * mil-ops and space beats, the China Card's slide): `hand:<human>`, `hand:<ai>` + `china:<ai>`, `milops:*`, `space:*`.
 */
import { useEffect, useState } from "react";
import { useI18n } from "../../i18n/react";
import { CardFace } from "../cards/CardFace";
import { sortHand } from "../cards/sortHand";
import { Icon } from "../common/Icon";
import { Seal } from "../common/Seal";
import { useAnchorRef } from "../console/Instrument";
import { useShown } from "../runner/ShownContext";
import { useUiRoot } from "../state/context";
import type { AnchorId } from "../ui-contract";
import s from "./compact.module.css";

export type DockPanel = "hand" | "adversary" | "log" | "status";

export interface BottomDockProps {
  /** The open sheet (null = none). */
  open: DockPanel | null;
  onOpen(panel: DockPanel): void;
  // ── extensions ──
  /** Compact landscape: icons only, 52 px. */
  iconsOnly?: boolean;
  className?: string;
}

/** New log entries since the log sheet was last open. */
function useUnread(open: boolean, length: number): number {
  const [seen, setSeen] = useState(length);
  useEffect(() => { if (open) setSeen(length); }, [open, length]);
  useEffect(() => { if (length < seen) setSeen(length); }, [length, seen]);
  return open ? 0 : Math.max(0, length - seen);
}

export function BottomDock({ open, onOpen, iconsOnly = false, className }: BottomDockProps) {
  const root = useUiRoot();
  const shown = useShown();
  const { t } = useI18n();
  const vm = root.vm;
  const human = vm.humanSide ?? "US";
  const ai = human === "US" ? "USSR" : "US";
  const state = shown.state;
  const hand = state ? sortHand(state.hands[human] ?? []) : [];
  const unread = useUnread(open === "log", vm.log.length);
  const handRef = useAnchorRef(open === "hand" ? undefined : (`hand:${human}` as AnchorId));
  const advRef = useAnchorRef(open === "adversary" ? undefined : ([`hand:${ai}`, `china:${ai}`] as AnchorId[]));
  const statusRef = useAnchorRef(open === "status" ? undefined : (["milops:US", "milops:USSR", "space:US", "space:USSR"] as AnchorId[]));
  const aiCount = state?.aiHandCount ?? 0;

  return (
    <nav className={[s.dock, iconsOnly ? s.dockIcons : "", className].filter(Boolean).join(" ")} aria-label={t("ui_shell:dock.label")}>
      <button
        type="button"
        ref={handRef}
        className={s.dockHand}
        aria-expanded={open === "hand"}
        aria-label={t("ui_shell:dock.handAria", { count: hand.length })}
        onClick={() => onOpen("hand")}
      >
        <span className={s.thumbs} aria-hidden="true">
          {hand.slice(0, 3).map((c, i) => (
            <span key={c} className={s.thumb} style={{ ["--i" as string]: i }}><CardFace card={c} width={26} /></span>
          ))}
        </span>
        {iconsOnly ? null : <span className={s.dl}>{t("ui_shell:dock.hand", { count: hand.length })}</span>}
        {iconsOnly ? null : <span className={s.chev} aria-hidden="true"><Icon name="chevron-up" size={16} /></span>}
      </button>
      <button type="button" ref={advRef} aria-expanded={open === "adversary"} aria-label={t("ui_shell:dock.adversaryAria", { count: aiCount })} onClick={() => onOpen("adversary")}>
        <Seal side={ai} size={22} className={s.dockSeal} />
        {iconsOnly ? null : <span className={s.dl}>{t("ui:adversary.title")}</span>}
        <span className={[s.badge, s.badgeN].join(" ")} aria-hidden="true">{aiCount}</span>
      </button>
      <button type="button" aria-expanded={open === "log"} aria-label={unread ? t("ui_shell:dock.logAria", { count: unread }) : t("ui_shell:dock.log")} onClick={() => onOpen("log")}>
        <Icon name="log" size={20} />
        {iconsOnly ? null : <span className={s.dl}>{t("ui_shell:dock.log")}</span>}
        {unread ? <span className={s.badge} aria-hidden="true">{unread > 99 ? "99+" : unread}</span> : null}
      </button>
      <button type="button" ref={statusRef} aria-expanded={open === "status"} aria-label={t("ui_console:status.title")} onClick={() => onOpen("status")}>
        <Icon name="status" size={20} />
        {iconsOnly ? null : <span className={s.dl}>{t("ui_console:status.title")}</span>}
      </button>
    </nav>
  );
}
