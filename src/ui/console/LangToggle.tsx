/**
 * Language switch (ui-spec §11.4): the segmented "EN | 中文" (the pressed one brass with ink text), or on
 * tablets one 32×32 button showing the *other* language ("中" / "EN"). `setLang` switches at once, no
 * reload; `<html lang>` follows, so every `:lang(zh)` rule applies. The pseudo-language counts as English.
 * Chinese is a separate download: when it fails (offline), the page stays as it is and says so in a toast
 * (`useSwitchLanguage`, shared with the settings dossier; Q-056).
 */
import { useCallback, useContext } from "react";
import type { Language } from "../../i18n";
import { useI18n } from "../../i18n/react";
import { UiRootContext } from "../state/context";
import s from "./Console.module.css";

/**
 * Switch the language with `set`, catching a failed download: `report` hears the error (never an unhandled
 * rejection). Resolves true when the switch went through.
 */
export async function switchLanguage(set: (lang: Language) => Promise<void>, lang: Language, report: (e: unknown) => void): Promise<boolean> {
  try {
    await set(lang);
    return true;
  } catch (e) {
    report(e);
    return false;
  }
}

/** `switchLanguage` for components: a failure is a warning toast inside a UiRoot (else a console warning). */
export function useSwitchLanguage(): (lang: Language) => Promise<boolean> {
  const { t, setLang } = useI18n();
  const root = useContext(UiRootContext);
  return useCallback((lang: Language) => switchLanguage(setLang, lang, e => {
    const msg = t("ui_shell:error.language", { lang: t(`ui:language.${lang === "zh-CN" ? "zh-CN" : "en"}`) });
    if (root) root.toast(msg, { tone: "warn" });
    else console.warn(msg, e);
  }), [t, setLang, root]);
}

export interface LangToggleProps {
  variant: "segmented" | "single";
  className?: string;
}

const isZh = (lang: Language) => lang === "zh-CN";

export function LangToggle({ variant, className }: LangToggleProps) {
  const { lang, t } = useI18n();
  const setLang = useSwitchLanguage();
  const zh = isZh(lang);
  if (variant === "single") {
    const target: Language = zh ? "en" : "zh-CN";
    return (
      <button
        type="button"
        className={[s.iconBtn, s.langSingle, className].filter(Boolean).join(" ")}
        lang={zh ? "en" : "zh-CN"}
        aria-label={t("ui_console:lang.switchTo", { lang: t(`ui:language.${target}`) })}
        title={t("ui_console:lang.switchTo", { lang: t(`ui:language.${target}`) })}
        onClick={() => void setLang(target)}
      >
        {zh ? t("ui_console:lang.en") : t("ui_console:lang.zhSingle")}
      </button>
    );
  }
  return (
    <div className={[s.langToggle, className].filter(Boolean).join(" ")} role="group" aria-label={t("ui:language.label")}>
      <button type="button" lang="en" aria-pressed={!zh} aria-label={t("ui:language.en")} onClick={() => { if (zh || lang !== "en") void setLang("en"); }}>
        {t("ui_console:lang.en")}
      </button>
      <button type="button" lang="zh-CN" aria-pressed={zh} aria-label={t("ui:language.zh-CN")} onClick={() => { if (!zh) void setLang("zh-CN"); }}>
        {t("ui_console:lang.zh")}
      </button>
    </div>
  );
}
