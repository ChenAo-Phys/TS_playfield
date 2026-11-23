/**
 * React binding for the i18n layer: components re-render when the language changes.
 *
 *   const { lang, t, render, setLang, cardName } = useI18n();
 *   <button onClick={() => setLang("zh-CN")}>{t("ui:language.zh-CN")}</button>
 *
 * The functions returned are new objects after each switch, so memoized children that receive them
 * as props redraw too. Call `initLanguage()` (src/i18n) once before the first render so the page
 * starts in the right language without a flash of English.
 */
import { useMemo, useSyncExternalStore } from "react";
import {
  cardDescription,
  cardName,
  countryName,
  countryShortName,
  language,
  onLanguageChange,
  regionName,
  regionNameById,
  render,
  setLanguage,
  sideName,
  t,
  type Language,
  type Message,
  type MessageFormat,
} from "./index";

export interface I18n {
  /** The current page language ("en", "zh-CN", or the pseudo-language "en-XA"). */
  lang: Language;
  /** The typed `t` (keys checked against the English catalog). */
  t: typeof t;
  /** A deferred Message in the current language. */
  render: (m: Message, how?: MessageFormat) => string;
  /** Switch language (loads its catalog, remembers the choice, redraws every `useI18n` user). */
  setLang: (lang: Language) => Promise<void>;
  cardName: (id: number) => string;
  cardDescription: (id: number) => string;
  countryName: (id: number) => string;
  countryShortName: (id: number) => string;
  regionName: (englishOrKey: string) => string;
  regionNameById: (id: number) => string;
  sideName: (side: string) => string;
}

/** The current language; re-renders the caller when it changes. */
export function useLanguage(): Language {
  return useSyncExternalStore(onLanguageChange, language, language);
}

/** The i18n functions bound to the current language; re-renders the caller when it changes. */
export function useI18n(): I18n {
  const lang = useLanguage();
  return useMemo<I18n>(() => {
    const call = t as unknown as (...args: unknown[]) => string;
    return {
      lang,
      t: ((...args: unknown[]) => call(...args)) as unknown as typeof t,
      render: (m, how) => render(m, how),
      setLang: setLanguage,
      cardName: id => cardName(id),
      cardDescription: id => cardDescription(id),
      countryName: id => countryName(id),
      countryShortName: id => countryShortName(id),
      regionName: name => regionName(name),
      regionNameById: id => regionNameById(id),
      sideName: side => sideName(side),
    };
  }, [lang]);
}
