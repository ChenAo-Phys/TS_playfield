/**
 * A tablet flyout (ui-spec §3.2): a 320 px panel over the map's right edge (z sheet) holding the same
 * section as the desktop rail. One at a time; Esc or the close button closes it, and the shell closes it on a
 * press outside it and the strip (R-017). The host positions it inside the table area, above the tray row (it
 * fills the height of its containing block, right-aligned).
 */
import { useI18n } from "../../i18n/react";
import { Icon } from "../common/Icon";
import { KeyScope } from "../common/keymap";
import { RailPanel, type RailPanelName } from "./sections";
import s from "./Rail.module.css";

export interface RailFlyoutProps {
  panel: RailPanelName;
  onClose(): void;
  className?: string;
}

export function RailFlyout({ panel, onClose, className }: RailFlyoutProps) {
  const { t } = useI18n();
  const title = panel === "adversary" ? t("ui:adversary.title")
    : panel === "effects" ? t("ui:effects.title")
    : panel === "log" ? t("ui:log.title")
    : t("ui_console:status.title");
  return (
    <KeyScope modal={false} onEscape={onClose}>
      <aside className={[s.flyout, "ts-grain", className].filter(Boolean).join(" ")} role="dialog" aria-label={title} data-panel={panel}>
        <button type="button" className={s.flyoutClose} aria-label={t("ui:action.close")} title={t("ui:action.close")} onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
        <div className={[s.flyoutBody, panel === "log" ? s.flyoutFill : ""].filter(Boolean).join(" ")}>
          <RailPanel panel={panel} />
        </div>
      </aside>
    </KeyScope>
  );
}
