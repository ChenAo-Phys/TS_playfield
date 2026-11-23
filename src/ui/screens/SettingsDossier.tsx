/**
 * The settings dossier (ui-spec §11.2, modal ⚙). UI preferences only (`UiSettings`, stored by the
 * state layer in localStorage "ts-playfield.ui.v1"); the language is the i18n layer's own choice.
 * Sound is left out: no sounds ship (§13 is optional), so a switch would do nothing.
 */
import { useI18n } from "../../i18n/react";
import { Button } from "../common/Button";
import { Dossier } from "../common/Dossier";
import { useSwitchLanguage } from "../console/LangToggle";
import { useUiRoot } from "../state/context";
import type { UiSettings } from "../ui-contract";
import { Segmented } from "./Segmented";
import s from "./dialogs.module.css";

export interface SettingsDossierProps {
  onClose(): void;
}

export function SettingsDossier({ onClose }: SettingsDossierProps) {
  const root = useUiRoot();
  const { t, lang } = useI18n();
  const setLang = useSwitchLanguage();
  const st = root.settings;
  const set = <K extends keyof UiSettings>(k: K) => (v: UiSettings[K]) => root.setSettings({ [k]: v } as Partial<UiSettings>);
  const onOff = [{ value: false, label: t("ui:settings.off") }, { value: true, label: t("ui:settings.on") }] as const;
  const onFirst = [{ value: true, label: t("ui:settings.on") }, { value: false, label: t("ui:settings.off") }] as const;
  const row = (label: string, control: React.ReactNode, hint?: string) => (
    <div className={s.setRow}>
      <span className={s.setLabel}>{label}</span>
      {control}
      {hint ? <span className={s.setHint}>{hint}</span> : null}
    </div>
  );
  return (
    <Dossier
      tab={t("ui:app.title")}
      title={t("ui:settings.title")}
      width={600}
      onClose={onClose}
      footer={<div className={s.footer}><Button variant="primary" onPaper onClick={onClose}>{t("ui:action.close")}</Button></div>}
    >
      <div className={s.settings}>
        {row(t("ui:settings.language"), (
          <Segmented
            label={t("ui:settings.language")}
            value={lang.startsWith("zh") ? "zh-CN" : "en"}
            options={[{ value: "en", label: t("ui:language.en") }, { value: "zh-CN", label: t("ui:language.zh-CN") }]}
            onChange={v => void setLang(v)}
          />
        ))}
        {row(t("ui:settings.cardImages"), (
          <Segmented
            label={t("ui:settings.cardImages")}
            value={st.cardImages}
            options={(["follow", "en", "zh"] as const).map(v => ({ value: v, label: t(`ui:settings.cardImagesOption.${v}`) }))}
            onChange={set("cardImages")}
          />
        ))}
        {row(t("ui:settings.animationSpeed"), (
          <Segmented
            label={t("ui:settings.animationSpeed")}
            value={st.speed}
            options={(["normal", "slow", "fast", "instant"] as const).map(v => ({ value: v, label: t(`ui:settings.speed.${v}`) }))}
            onChange={set("speed")}
          />
        ))}
        {row(t("ui:settings.motion.label"), (
          <Segmented
            label={t("ui:settings.motion.label")}
            value={st.motion}
            options={(["system", "reduce", "full"] as const).map(v => ({ value: v, label: t(`ui:settings.motion.${v}`) }))}
            onChange={set("motion")}
          />
        ))}
        {row(t("ui:settings.confirmFinal"), (
          <Segmented label={t("ui:settings.confirmFinal")} value={st.confirmFinal} options={onFirst} onChange={set("confirmFinal")} />
        ), t("ui:settings.confirmFinalHint"))}
        {row(t("ui:settings.pauseOnReveals"), (
          <Segmented label={t("ui:settings.pauseOnReveals")} value={st.pauseOnReveals} options={onFirst} onChange={set("pauseOnReveals")} />
        ))}
        {row(t("ui:settings.mapLabels"), (
          <Segmented
            label={t("ui:settings.mapLabels")}
            value={st.mapLabels}
            options={([100, 115, 130] as const).map(v => ({ value: v, label: t("ui:settings.mapLabelsValue", { percent: v }) }))}
            onChange={set("mapLabels")}
          />
        ))}
        {row(t("ui:settings.patterns"), (
          <Segmented label={t("ui:settings.patterns")} value={st.patterns} options={onOff} onChange={set("patterns")} />
        ))}
        {row(t("ui:settings.followAction"), (
          <Segmented label={t("ui:settings.followAction")} value={st.followAction} options={onOff} onChange={set("followAction")} />
        ))}
      </div>
    </Dossier>
  );
}
