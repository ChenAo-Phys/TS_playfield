/**
 * The two confirmations of the menu (ui-spec §11.3): New game (`ui:game.newGameConfirm.*`, a click)
 * and Resign (`ui:game.resignConfirm.*`, press and hold 1.2 s).
 */
import { useI18n } from "../../i18n/react";
import { Button } from "../common/Button";
import { Dossier } from "../common/Dossier";
import { HoldButton } from "../common/HoldButton";
import s from "./dialogs.module.css";

export interface ConfirmDossierProps {
  kind: "newGame" | "resign";
  onConfirm(): void;
  onClose(): void;
}

export function ConfirmDossier({ kind, onConfirm, onClose }: ConfirmDossierProps) {
  const { t } = useI18n();
  const k = kind === "newGame" ? "newGameConfirm" : "resignConfirm";
  const confirm = t(`ui:game.${k}.confirm`);
  return (
    <Dossier
      tab={kind === "newGame" ? t("ui:menu.newGame") : t("ui:game.resign")}
      title={t(`ui:game.${k}.title`)}
      width={460}
      onClose={onClose}
      footer={(
        <div className={s.footer}>
          <Button variant="ghost" onPaper onClick={onClose}>{t(`ui:game.${k}.cancel`)}</Button>
          {kind === "resign"
            ? <HoldButton label={confirm} onConfirm={onConfirm} globalEnter>{confirm}</HoldButton>
            : <Button variant="danger" onPaper onClick={onConfirm}>{confirm}</Button>}
        </div>
      )}
    >
      <p className={s.confirmText}>{t(`ui:game.${k}.text`)}</p>
    </Dossier>
  );
}
