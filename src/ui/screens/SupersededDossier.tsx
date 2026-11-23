/**
 * "This game continued in another tab" (QA Q-002): another tab resumed, started or wrote this page's saved game,
 * so the controller takes no more moves here (`vm.superseded`). A blocking dossier (no close, no Esc) whose one
 * action reloads the page, which offers the save again from the start screen.
 */
import { useI18n } from "../../i18n/react";
import { Button } from "../common/Button";
import { Dossier } from "../common/Dossier";
import s from "./dialogs.module.css";

export interface SupersededDossierProps {
  /** Default: reload the page. */
  onReload?(): void;
}

export function SupersededDossier({ onReload }: SupersededDossierProps) {
  const { t } = useI18n();
  const reload = onReload ?? (() => window.location.reload());
  return (
    <Dossier
      tab={t("ui:app.title")}
      title={t("ui_shell:superseded.title")}
      width={460}
      footer={(
        <div className={s.footer}>
          <Button variant="primary" onPaper onClick={reload}>{t("ui_shell:superseded.reload")}</Button>
        </div>
      )}
    >
      <p className={s.confirmText}>{t("ui_shell:superseded.body")}</p>
    </Dossier>
  );
}
