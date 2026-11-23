/**
 * Which language's card images to show (ui-spec §7.1, setting `cardImages`): "follow" = the UI
 * language, or always "en" / "zh". The pseudo-language follows English.
 */
import { useContext } from "react";
import { cardImageUrl, dataLang } from "../../data";
import { useLanguage } from "../../i18n/react";
import { UiRootContext } from "../state/context";
import type { UiSettings } from "../ui-contract";

export type CardImageLang = "en" | "zh";

export function cardImageLang(setting: UiSettings["cardImages"] | undefined, uiLang: string): CardImageLang {
  if (setting === "en" || setting === "zh") return setting;
  return dataLang(uiLang);
}

/** The card-image language now (settings from the UiRoot when mounted, else "follow"). */
export function useCardImageLang(): CardImageLang {
  const lang = useLanguage();
  const root = useContext(UiRootContext);
  return cardImageLang(root?.settings.cardImages, lang);
}

/** `id → image URL` in the current card-image language. */
export function useCardImageUrl(): (id: number) => string {
  const lang = useCardImageLang();
  return (id: number) => cardImageUrl(id, lang);
}
