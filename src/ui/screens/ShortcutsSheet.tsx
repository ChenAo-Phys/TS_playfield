/**
 * The keyboard shortcut sheet (ui-spec §12), opened with `?` or from the menu. Rows and key caps come
 * from `ui:shortcuts.row.*` / `ui:shortcuts.key.*` (tools/ui-keys.mjs SHORTCUT_ROWS order).
 */
import { useI18n } from "../../i18n/react";
import { Button } from "../common/Button";
import { Dossier } from "../common/Dossier";
import s from "./dialogs.module.css";

export const SHORTCUT_ROWS = [
  "focus", "mapArrows", "cycleTargets", "regions", "enter", "holdEnter", "space", "shiftSpace",
  "esc", "undo", "done", "modes", "targets", "log", "camera", "help",
] as const;

export interface ShortcutsSheetProps {
  onClose(): void;
}

export function ShortcutsSheet({ onClose }: ShortcutsSheetProps) {
  const { t } = useI18n();
  return (
    <Dossier
      tab={t("ui:app.title")}
      title={t("ui:shortcuts.title")}
      width={620}
      onClose={onClose}
      footer={<div className={s.footer}><Button variant="primary" onPaper onClick={onClose}>{t("ui:action.close")}</Button></div>}
    >
      <table className={s.keys}>
        <tbody>
          {SHORTCUT_ROWS.map(id => (
            <tr key={id}>
              <th scope="row"><kbd>{t(`ui:shortcuts.key.${id}`)}</kbd></th>
              <td>{t(`ui:shortcuts.row.${id}`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dossier>
  );
}
