/**
 * The rail (ui-spec §6, desktop): the adversary dossier (≈ 150 px), the In-effect chips (auto height, at
 * most 4 rows, then the section scrolls) and the Dispatches (the rest). Collapsed (setting
 * `railCollapsed`) it is the 60 px icon strip; the handle and the L key toggle it. It keeps the rail's
 * beats registered (`useRailBeats`) for as long as it is mounted.
 */
import { useI18n } from "../../i18n/react";
import { useKey } from "../common/keymap";
import { useUiRoot } from "../state/context";
import { AdversaryDossier } from "./AdversaryDossier";
import { Dispatches } from "./Dispatches";
import { EffectsStrip } from "./EffectsStrip";
import { RailStrip } from "./RailStrip";
import { useRailBeats } from "./useRailBeats";
import { useRailData } from "./useRailData";
import s from "./Rail.module.css";

export interface RailProps {
  collapsed: boolean;
  onToggle(): void;
  className?: string;
}

export function Rail({ collapsed, onToggle, className }: RailProps) {
  const root = useUiRoot();
  const { t } = useI18n();
  const d = useRailData();
  useRailBeats(root.director, d.aiSide);
  useKey("l", () => onToggle());
  const handle = (
    <button
      type="button"
      className={s.handle}
      aria-expanded={!collapsed}
      aria-label={collapsed ? t("ui_console:rail.show") : t("ui_console:rail.hide")}
      title={collapsed ? t("ui_console:rail.show") : t("ui_console:rail.hide")}
      onClick={onToggle}
    >
      <span aria-hidden="true">{collapsed ? "‹" : "›"}</span>
    </button>
  );
  if (collapsed) {
    return (
      <aside className={[s.rail, s.collapsed, "ts-grain", className].filter(Boolean).join(" ")} aria-label={t("ui_console:rail.label")}>
        {handle}
        <RailStrip open={null} onOpen={() => onToggle()} />
      </aside>
    );
  }
  return (
    <aside className={[s.rail, "ts-grain", className].filter(Boolean).join(" ")} aria-label={t("ui_console:rail.label")}>
      {handle}
      {d.state ? <AdversaryDossier state={d.state} aiSide={d.aiSide} status={d.status} /> : null}
      <EffectsStrip flags={d.state?.flags ?? []} />
      <Dispatches log={d.log} humanSide={d.humanSide} current={d.current} />
    </aside>
  );
}
