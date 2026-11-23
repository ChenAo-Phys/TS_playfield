/**
 * MessageText (src/ui/common/MessageText.tsx): refs, whitelisted markup, no HTML from parameters,
 * language switches.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it } from "vitest";
import { message, setLanguage } from "../../../src/i18n";
import { messageParts, MessageText, parseParts, partsText } from "../../../src/ui/common/MessageText";
import { CountryPulseContext } from "../../../src/ui/common/countryPulse";
import { mockRoot, withRoot } from "./mocks";

afterAll(async () => { await setLanguage("en"); });

describe("parseParts", () => {
  it("splits refs and whitelisted tags, keeps unknown tags as text", () => {
    const s = "a <strong>b <em>c</em></strong> c74VOA <script>x</script><br/>end";
    const parts = parseParts(s);
    expect(parts[0]).toEqual({ t: "text", s: "a " });
    expect(parts[1]).toMatchObject({ t: "tag", tag: "strong" });
    expect(parts).toContainEqual({ t: "card", id: 74, name: "VOA" });
    expect(parts).toContainEqual({ t: "br" });
    expect(partsText(parts)).toBe("a b c VOA <script>x</script>\nend");
  });
});

describe("messageParts / MessageText", () => {
  const m = message("prompt:warning.opponent-event", { card: { card: 74, name: "The Voice of America" }, side: { side: "US" } });

  it("turns card parameters into refs, in the current language", async () => {
    await setLanguage("en");
    const parts = messageParts(m);
    expect(parts).toContainEqual({ t: "card", id: 74, name: "The Voice of America" });
    await setLanguage("zh-CN");
    expect(messageParts(m)).toContainEqual({ t: "card", id: 74, name: "美国之音" });
    await setLanguage("en");
  });

  it("renders CardRef buttons inside a UiRoot and plain text with refs=false", () => {
    const { root, overlays } = mockRoot();
    const html = renderToStaticMarkup(withRoot(createElement(MessageText, { message: m }), root, overlays) as never);
    expect(html).toMatch(/<span[^>]*data-card="74"[^>]*role="button"[^>]*>The Voice of America<\/span>/);
    const plain = renderToStaticMarkup(createElement(MessageText, { message: m, refs: false }));
    expect(plain).not.toContain("data-card");
    expect(plain).toContain("The Voice of America is a US card");
  });

  it("country refs pulse only when a map is there", () => {
    const cm = message("prompt:doneFor.blockade", { country: { country: 7, name: "West Germany" } });
    const without = renderToStaticMarkup(createElement(MessageText, { message: cm }));
    expect(without).toMatch(/data-country="7"/);
    expect(without).not.toMatch(/role="button"/);
    const withMap = renderToStaticMarkup(createElement(CountryPulseContext.Provider, { value: () => undefined }, createElement(MessageText, { message: cm })));
    expect(withMap).toMatch(/data-country="7"[^>]*role="button"/);
  });

  it("never lets a parameter inject markup", () => {
    const evil = message("ui:error.unexpected", { message: "<img src=x onerror=alert(1)><strong>no</strong>" });
    const html = renderToStaticMarkup(createElement(MessageText, { message: evil }));
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<strong>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;&lt;strong&gt;no&lt;/strong&gt;");
  });

  it("marks every string in the pseudo-language", async () => {
    await setLanguage("en-XA");
    const html = renderToStaticMarkup(createElement(MessageText, { message: m, refs: false }));
    expect(html.startsWith("⟦")).toBe(true);
    expect(html).toContain("⟦The Voice of America⟧");
    await setLanguage("en");
  });
});
