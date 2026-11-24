/**
 * About & credits (ui-spec §11.3): what the site is, where the game is saved (this browser only, and not
 * tamper-proof: save v2, OD-1), the rules variant, credits (DeepStruggle MIT, the model, fonts under the OFL,
 * Natural Earth), a link to GMT's official living rules (never hosted here) and the trademark note.
 */
import { useContext } from "react";
import { MODEL_LABEL } from "../../ai/config";
import { useI18n } from "../../i18n/react";
import { Button } from "../common/Button";
import { Dossier } from "../common/Dossier";
import { Icon } from "../common/Icon";
import { UiRootContext } from "../state/context";
import s from "./dialogs.module.css";

export interface AboutDossierProps {
  onClose(): void;
}

/** The OFL text shipped next to the fonts (public/fonts/OFL.txt). */
const OFL_URL = `${import.meta.env.BASE_URL}fonts/OFL.txt`;
/** The third-party notices (public/THIRD_PARTY_LICENSES.txt, written by tools/build-licenses.mjs; Q-012). */
const LICENSES_URL = `${import.meta.env.BASE_URL}THIRD_PARTY_LICENSES.txt`;
const NATURAL_EARTH_URL = "https://www.naturalearthdata.com/";

export function AboutDossier({ onClose }: AboutDossierProps) {
  const { t } = useI18n();
  // D-203: while this game is not being saved, the save line says so too.
  const unsaved = !!useContext(UiRootContext)?.vm.saveUnavailable;
  const ext = (href: string, label: string) => (
    <a href={href} target="_blank" rel="noopener noreferrer">{label}<Icon name="external" size={12} /></a>
  );
  return (
    <Dossier
      tab={t("ui:app.title")}
      title={t("ui_shell:about.title")}
      width={640}
      onClose={onClose}
      footer={<div className={s.footer}><Button variant="primary" onPaper onClick={onClose}>{t("ui:action.close")}</Button></div>}
    >
      <div className={s.about}>
        <p>{t("ui:about.body")}</p>
        <p>{t("ui_shell:about.save")}{unsaved ? ` ${t("ui_shell:save.aboutNow")}` : null}</p>
        <p>{t("ui:about.rulesVariant")}</p>
        <h3>{t("ui_shell:about.rules")}</h3>
        <p>{t("ui:about.rulebook")}</p>
        <ul className={s.links}>
          <li>{ext(t("ui:links.rules"), t("ui:menu.rulesTitle"))}</li>
        </ul>
        <h3>{t("ui_shell:about.credits")}</h3>
        <p>{t("ui:about.engine")}</p>
        <p>{t("ui:about.model", { model: MODEL_LABEL })}</p>
        <p>{t("ui_shell:about.fonts")}</p>
        <p>{t("ui_shell:about.map")}</p>
        <ul className={s.links}>
          <li>{ext(t("ui:links.deepstruggle"), t("ui:about.source"))}</li>
          <li>{ext(t("ui:links.leaderboard"), t("ui_shell:about.leaderboard"))}</li>
          <li>{ext(t("ui:links.model"), t("ui_shell:about.modelLink"))}</li>
          <li>{ext(OFL_URL, t("ui_shell:about.oflLink"))}</li>
          <li>{ext(LICENSES_URL, t("ui:about.licenses"))}</li>
          <li>{ext(NATURAL_EARTH_URL, t("ui_shell:about.naturalEarth"))}</li>
        </ul>
        <h3>{t("ui_shell:about.legal")}</h3>
        <p className={s.small}>{t("ui:about.trademark")}</p>
      </div>
    </Dossier>
  );
}
