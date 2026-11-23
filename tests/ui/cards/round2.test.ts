/**
 * QA round 2, fix group F3: R-013, Chinese names on hand spines end in whole characters and drawn dots, never in an
 * ellipsis glyph drawn into the last character ("我们在德黑羊", "红色恐慌 太").
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../../../src/i18n";
import { CardFace } from "../../../src/ui/cards";
import { cutSpine, spineName } from "../../../src/ui/cards/CardFace";

const h = createElement;
const css = readFileSync(new URL("../../../src/ui/cards/cards.module.css", import.meta.url), "utf8");

beforeAll(() => { vi.spyOn(console, "error").mockImplementation(() => undefined); });
afterAll(async () => { vi.restoreAllMocks(); await setLanguage("en"); });

/**
 * The band of an 86 px tablet card (cards.module.css `.small .spine`): 120 px card − 22 px bottom − 7 + 4 px padding
 * = 87 px of line; zh `--ts-fs-xs` 11.5 px with .04em tracking: every upright character advances 11.96 px; the dots
 * take 1.25 em (half an em apart, .75 em long).
 */
const BAND = 87, ADVANCE = 11.5 * 1.04, DOTS = 11.5 * 1.25;
const model = (name: string) => {
  const chars = Array.from(spineName(name, true));
  return cutSpine(chars, chars.map((_, i) => (i + 1) * ADVANCE), BAND, DOTS);
};

describe("R-013 Chinese spines at 86 px cards", () => {
  it("我们在德黑兰的人 keeps six whole characters, then the dots", () => {
    expect(model("我们在德黑兰的人")).toEqual({ text: "我们在德黑兰", more: true });
  });
  it("红色恐慌/大清洗: the slash stands upright as ／, and the cut falls after 大", () => {
    expect(spineName("红色恐慌/大清洗", true)).toBe("红色恐慌／大清洗");
    expect(spineName("Red Scare/Purge", false)).toBe("Red Scare/Purge");
    expect(model("红色恐慌/大清洗")).toEqual({ text: "红色恐慌／大", more: true });
  });
  it("a name that fits stays whole, with no dots", () => {
    expect(model("英美特殊关系")).toEqual({ text: "英美特殊关系", more: false });
    expect(model("殖民地后卫部队")).toEqual({ text: "殖民地后卫部队", more: false }); // 7 × 11.96 = 83.7 ≤ 87
  });
  it("measured ends decide, not a count: a narrow character lets one more in", () => {
    const chars = ["A", "B", "C"];
    expect(cutSpine(chars, [5, 10, 40], 30, 10)).toEqual({ text: "AB", more: true });
    expect(cutSpine(chars, [5, 10, 40], 40, 10)).toEqual({ text: "ABC", more: false });
    expect(cutSpine([], [], 30, 10)).toEqual({ text: "", more: false });
  });
  it("CardFace: the zh spine shows the upright slash (the cut needs a layout, so the server renders the whole name)", async () => {
    await setLanguage("zh-CN");
    try {
      const out = renderToStaticMarkup(h(CardFace, { card: 31, width: 86, caption: true, spine: true }));
      expect(out).toMatch(/class="[^"]*spineText[^"]*">红色恐慌／大清洗<\/span>/);
      expect(out).toContain('alt="红色恐慌/大清洗"'); // the image keeps the real name
    } finally {
      await setLanguage("en");
    }
    expect(renderToStaticMarkup(h(CardFace, { card: 31, width: 86, caption: true, spine: true }))).toMatch(/spineText[^"]*">Red Scare\/Purge</);
  });
  it("stylesheet: no browser ellipsis on Chinese spines; the dots' slot matches the measure (.5 em + .75 em)", () => {
    expect(css).toMatch(/:global\(:root:lang\(zh\)\) \.spine \{ text-overflow: clip; \}/);
    expect(css).toMatch(/\.spineMore \{[^}]*inline-size: \.75em;[^}]*margin-inline-start: \.5em;/);
  });
});
