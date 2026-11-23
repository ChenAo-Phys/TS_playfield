/**
 * The rail strip (ui-spec §3.2, tablets; also the desktop rail when collapsed): four 42×42 buttons —
 * Adversary (the AI's seal + hand-count badge), In effect (count badge), Dispatches (a dot for unread
 * entries), Status (mil ops + space). Each opens its flyout (`RailFlyout`, one at a time). While a
 * panel is closed its button stands in as the anchor (`hand:<ai>` and `china:<ai>`, `effects`, mil ops /
 * space), so card flights and the China Card's slide still have somewhere to land.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useI18n } from "../../i18n/react";
import { Icon } from "../common/Icon";
import { Seal } from "../common/Seal";
import { useAnchorRef } from "../console/Instrument";
import { useUiRoot } from "../state/context";
import type { AnchorId } from "../ui-contract";
import { effectChips } from "./EffectsStrip";
import type { RailPanelName } from "./sections";
import { useRailBeats } from "./useRailBeats";
import { useRailData } from "./useRailData";
import s from "./Rail.module.css";

export interface RailStripProps {
  open: RailPanelName | null;
  onOpen(panel: RailPanelName): void;
  className?: string;
}

function StripButton({ panel, open, label, anchors, onOpen, children }: {
  panel: RailPanelName;
  open: RailPanelName | null;
  label: string;
  anchors: AnchorId[];
  onOpen(p: RailPanelName): void;
  children: ReactNode;
}) {
  const ref = useAnchorRef(open === panel ? undefined : anchors);
  return (
    <button ref={ref} type="button" className={s.stripBtn} aria-pressed={open === panel} aria-label={label} title={label} onClick={() => onOpen(panel)} data-panel={panel}>
      {children}
    </button>
  );
}

export function RailStrip({ open, onOpen, className }: RailStripProps) {
  const root = useUiRoot();
  const { t } = useI18n();
  const d = useRailData();
  useRailBeats(root.director, d.aiSide);
  const [seen, setSeen] = useState(d.log.length);
  useEffect(() => {
    if (open === "log") setSeen(d.log.length);
  }, [open, d.log.length]);
  const unread = open !== "log" && d.log.length > seen;
  const fx = effectChips(d.state?.flags ?? []).length;
  return (
    <nav className={[s.strip, className].filter(Boolean).join(" ")} aria-label={t("ui_console:rail.label")}>
      <StripButton panel="adversary" open={open} label={t("ui:adversary.title")} anchors={[`hand:${d.aiSide}`, `china:${d.aiSide}`]} onOpen={onOpen}>
        <Seal side={d.aiSide} size={30} />
        {d.state ? <span className={`${s.badge} ts-num`}>{d.state.aiHandCount}</span> : null}
        {d.status === "thinking" ? <span className={`${s.thinkDot} ts-ambient`} aria-hidden="true" /> : null}
      </StripButton>
      <StripButton panel="effects" open={open} label={t("ui:effects.title")} anchors={["effects"]} onOpen={onOpen}>
        <Icon name="event" size={22} />
        {fx ? <span className={`${s.badge} ts-num`}>{fx}</span> : null}
      </StripButton>
      <StripButton panel="log" open={open} label={unread ? t("ui_console:log.unread") : t("ui:log.title")} anchors={[]} onOpen={onOpen}>
        <Icon name="log" size={22} />
        {unread ? <span className={s.dot} aria-hidden="true" /> : null}
      </StripButton>
      <StripButton panel="status" open={open} label={t("ui_console:status.title")} anchors={["milops:US", "milops:USSR", "space:US", "space:USSR"]} onOpen={onOpen}>
        <Icon name="status" size={22} />
      </StripButton>
    </nav>
  );
}
