/**
 * The React binding: useI18n renders in the current language and is wired to language changes.
 * (Node has no DOM here, so rendering goes through react-dom/server; the hook's store is checked
 * directly.)
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it } from "vitest";
import { language, onLanguageChange, setLanguage } from "../../src/i18n";
import { useI18n, useLanguage } from "../../src/i18n/react";

function Probe() {
  const { lang, t, cardName, countryName, regionName, sideName } = useI18n();
  return createElement("p", { lang }, [t("ui:menu.newGame"), cardName(21), countryName(7), regionName("Asia"), sideName("US")].join("|"));
}

function LangOnly() {
  return createElement("span", null, useLanguage());
}

describe("useI18n", () => {
  afterAll(async () => { await setLanguage("en"); });

  it("renders in the current language, and again after a switch", async () => {
    await setLanguage("en");
    expect(renderToStaticMarkup(createElement(Probe))).toBe('<p lang="en">New game|NATO|West Germany|Asia|US</p>');
    await setLanguage("zh-CN");
    expect(renderToStaticMarkup(createElement(Probe))).toBe('<p lang="zh-CN">新游戏|北约|西德|亚洲|美国</p>');
    expect(renderToStaticMarkup(createElement(LangOnly))).toBe("<span>zh-CN</span>");
  });

  it("its store notifies on a switch and reports the new snapshot", async () => {
    await setLanguage("en");
    const seen: string[] = [];
    const off = onLanguageChange(() => { seen.push(language()); });
    await setLanguage("zh-CN");
    await setLanguage("en");
    off();
    await setLanguage("zh-CN");
    expect(seen).toEqual(["zh-CN", "en"]);
  });
});
