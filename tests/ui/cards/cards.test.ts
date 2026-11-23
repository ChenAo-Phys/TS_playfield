/**
 * Cards (src/ui/cards): faces, backs, the China Card, tags, hand order, play notes, zoom host, sheet.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../../../src/i18n";
import { renderEnglish } from "../../../src/i18n";
import type { SpaceBox } from "../../../src/engine/layout";
import {
  CardBack, CardFace, CardSheet, CardTags, CardZoomHost, ChinaCardFace, cardImageLang, cardPlayNotes, cardTagKinds, mergeHandOrder, sortHand,
} from "../../../src/ui/cards";
import { mockRoot, prompt, withRoot } from "../common/mocks";

const html = (el: unknown) => renderToStaticMarkup(el as never);
const h = createElement;

beforeAll(() => { vi.spyOn(console, "error").mockImplementation(() => undefined); });
afterAll(async () => { vi.restoreAllMocks(); await setLanguage("en"); });

describe("CardFace", () => {
  it("draws the image at 5:7 with its name as alt, lazily unless eager", () => {
    const out = html(h(CardFace, { card: 74, width: 104 }));
    expect(out).toMatch(/src="[^"]*cards\/en\/074\.webp"/);
    expect(out).toContain('alt="The Voice of America"');
    expect(out).toContain("width:104px;height:146px");
    expect(out).toContain('loading="lazy"');
    expect(html(h(CardFace, { card: 74, width: 104, eager: true }))).toContain('loading="eager"');
  });

  it("caption: ops badge in the side's shape, name, overlap padding; none below 64 px", () => {
    const out = html(h(CardFace, { card: 74, width: 104, caption: true, overlapRight: 30 }));
    expect(out).toMatch(/class="[^"]*ops_us[^"]*"[^>]*>2</);
    expect(out).toContain("--ov:30px");
    expect(out).toMatch(/capName[^>]*>The Voice of America</);
    expect(html(h(CardFace, { card: 74, width: 56, caption: true }))).not.toContain("capName");
    expect(html(h(CardFace, { card: 50, width: 104, caption: true }))).toMatch(/ops_ussr/);
  });

  it("dims and tags", () => {
    expect(html(h(CardFace, { card: 74, width: 104, dim: "unplayable" }))).toContain('data-dim="unplayable"');
    expect(html(h(CardFace, { card: 1, width: 104, tags: h(CardTags, { card: 1 }) }))).toContain('data-tone="scoring"');
  });

  it("follows the card-image setting and the language", async () => {
    expect(cardImageLang("follow", "zh-CN")).toBe("zh");
    expect(cardImageLang("follow", "en-XA")).toBe("en");
    expect(cardImageLang("en", "zh-CN")).toBe("en");
    await setLanguage("zh-CN");
    expect(html(h(CardFace, { card: 74, width: 104 }))).toMatch(/cards\/zh\/074\.webp[^>]*|alt="美国之音"/);
    const { root, overlays } = mockRoot({ settings: { cardImages: "en" } });
    const out = html(withRoot(h(CardFace, { card: 74, width: 104 }), root, overlays));
    expect(out).toMatch(/cards\/en\/074\.webp/);
    expect(out).toContain('alt="美国之音"');
    await setLanguage("en");
  });
});

describe("CardBack / ChinaCardFace", () => {
  it("the back is an SVG image named as an unknown card", () => {
    const out = html(h(CardBack, { width: 44 }));
    expect(out).toContain('role="img"');
    expect(out).toContain('aria-label="Unknown card"');
    expect(out).toContain('height="62"');
    expect(html(h(CardBack, { width: 22, label: "" }))).toContain('aria-hidden="true"');
  });

  it("face up is the card image; face down carries both titles and a translated ribbon", async () => {
    expect(html(h(ChinaCardFace, { faceUp: true, width: 92 }))).toMatch(/cards\/en\/006\.webp/);
    const down = html(h(ChinaCardFace, { faceUp: false, width: 92 }));
    expect(down).toContain("THE CHINA CARD");
    expect(down).toContain("中国牌");
    expect(down).toContain(">Face down<");
    expect(down).toContain('aria-label="The China Card, face down"');
    await setLanguage("zh-CN");
    const zh = html(h(ChinaCardFace, { faceUp: false, width: 92 }));
    expect(zh).toContain(">正面朝下<");
    expect(zh).toContain('aria-label="中国牌，正面朝下"');
    await setLanguage("en");
  });
});

describe("caption names (cards.module.css)", () => {
  const css = readFileSync(resolve(__dirname, "../../../src/ui/cards/cards.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  it("wrap whole words (never mid-word), with an ellipsis for a word wider than the line", () => {
    const name = css.match(/\.capName\s*\{([^}]*)\}/)![1]!;
    expect(name).not.toMatch(/overflow-wrap:\s*anywhere|word-break:\s*break-all/);
    expect(name).toMatch(/overflow-wrap:\s*normal/);
    expect(name).toMatch(/text-overflow:\s*ellipsis/);
    expect(name).toMatch(/-webkit-line-clamp:\s*2/);
  });
  it("fall back to one line with an ellipsis on a narrow strip, and to the Ops badge alone below that", () => {
    expect(css).toMatch(/\.cap\s*\{[^}]*container-type:\s*inline-size/);
    const queries = [...css.matchAll(/@container\s*\(max-width:\s*(\d+)px\)\s*\{([^}]*)\}/g)].map(m => [Number(m[1]), m[2]!] as const);
    expect(queries.find(([, body]) => /white-space:\s*nowrap/.test(body))).toBeTruthy();
    const none = queries.find(([, body]) => /display:\s*none/.test(body))!;
    const line = queries.find(([, body]) => /white-space:\s*nowrap/.test(body))!;
    expect(none[0]).toBeLessThan(line[0]);
  });
});

describe("spine (QA OD-3)", () => {
  const css = readFileSync(resolve(__dirname, "../../../src/ui/cards/cards.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  it("CardFace spine: the name in a side-toned band, aria-hidden; needs the caption", () => {
    const us = html(h(CardFace, { card: 74, width: 104, caption: true, overlapRight: 57, spine: true }));
    expect(us).toContain('data-spine="true"');
    expect(us).toMatch(/class="[^"]*spine[^"]*spine_us[^"]*" aria-hidden="true"><span class="[^"]*spineText[^"]*">The Voice of America</);
    expect(us).toMatch(/class="[^"]*spined/);
    expect(html(h(CardFace, { card: 50, width: 104, caption: true, spine: true }))).toMatch(/spine_ussr/);
    expect(html(h(CardFace, { card: 1, width: 104, caption: true, spine: true }))).toMatch(/spine_neutral/);
    expect(html(h(CardFace, { card: 74, width: 104, spine: true }))).not.toContain("data-spine");
    expect(html(h(CardFace, { card: 74, width: 56, caption: true, spine: true }))).not.toContain("data-spine");
    // the image keeps the name as its alt (the accessible name is unchanged)
    expect(us).toContain('alt="The Voice of America"');
  });
  it("cards.module.css: vertical writing, one line ending in an ellipsis, side tones, the --spine-on switch", () => {
    const spine = css.match(/\.spine\s*\{([^}]*)\}/)![1]!;
    expect(spine).toMatch(/writing-mode:\s*vertical-rl/);
    expect(spine).toMatch(/white-space:\s*nowrap/);
    expect(spine).toMatch(/text-overflow:\s*ellipsis/);
    expect(spine).toMatch(/overflow:\s*hidden/);
    expect(spine).toMatch(/opacity:\s*var\(--spine-on,\s*1\)/);
    expect(spine).toMatch(/var\(--ts-font-ui\)/);
    expect(css).toMatch(/:root:lang\(zh\)\)\s*\.spine\s*\{[^}]*font-family:\s*var\(--ts-font-body\)/);
    expect(css).toMatch(/\.spined\s+\.capName\s*\{[^}]*opacity:\s*calc\(1 - var\(--spine-on,\s*1\)\)/);
    for (const side of ["us", "ussr", "neutral"]) expect(css).toMatch(new RegExp(`\\.spine_${side}\\s*\\{[^}]*background`));
    expect(css).toMatch(/\.dim_unplayable\s+\.spine\s*\{[^}]*filter/);
  });
});

describe("CardTags", () => {
  it("picks the tags in order", () => {
    expect(cardTagKinds(1)).toEqual(["scoring"]);
    expect(cardTagKinds(74, [{ code: "opponent-event", params: { card: 74, side: "US" } }, { code: "scoring-stranded" }], true))
      .toEqual(["strands", "opponent", "known"]);
    expect(cardTagKinds(1, [], false, true)).toEqual([]);
  });

  it("compact: KNOWN TO AI shrinks to its eye; the words stay for assistive technology and the tooltip", () => {
    const full = html(h(CardTags, { card: 74, known: true }));
    const compact = html(h(CardTags, { card: 74, known: true, compact: true }));
    expect(full).not.toContain("data-compact");
    expect(compact).toContain('data-compact="true"');
    expect(compact).toContain('title="Known to AI"');
    expect(compact).toMatch(/<span class="ts-vh">Known to AI<\/span>/);
    expect(compact).toContain('data-icon="eye"');
    // Other tags keep their words.
    expect(html(h(CardTags, { card: 1, known: true, compact: true }))).toContain("Scoring");
  });

  it("renders translated tags", async () => {
    const out = html(h(CardTags, { card: 74, warnings: [{ code: "opponent-event", params: { card: 74, side: "US" } }], known: true }));
    expect(out).toContain("US event");
    expect(out).toContain("Known to AI");
    await setLanguage("zh-CN");
    expect(html(h(CardTags, { card: 1 }))).toContain("计分牌");
    await setLanguage("en");
  });
});

describe("hand order", () => {
  it("scoring first, then Ops descending, then id", () => {
    // 81 South America Scoring, 2 Europe Scoring, 39 Arms Race 3, 51 Brezhnev Doctrine 3, 58 Cultural Revolution 3, 74 VOA 2
    expect(sortHand([81, 39, 51, 58, 74, 2])).toEqual([2, 81, 39, 51, 58, 74]);
  });

  it("keeps the order stable within a turn and inserts new cards at their place", () => {
    expect(mergeHandOrder([], [74, 2, 39])).toEqual([2, 39, 74]);
    expect(mergeHandOrder([74, 2, 39], [74, 39, 2])).toEqual([74, 2, 39]);
    expect(mergeHandOrder([2, 39, 74], [2, 74, 51, 39])).toEqual([2, 39, 51, 74]);
    expect(mergeHandOrder([2, 39, 74], [74])).toEqual([74]);
  });
});

describe("play notes", () => {
  const boxes: SpaceBox[] = [
    { min_ops: 0, max_roll: 0, vp_first: 0, vp_second: 0 }, { min_ops: 2, max_roll: 3, vp_first: 2, vp_second: 1 },
    { min_ops: 2, max_roll: 4, vp_first: 0, vp_second: 0 }, { min_ops: 2, max_roll: 3, vp_first: 2, vp_second: 0 },
  ];
  const ar = prompt({ kind: "action-card", cards: [74, 6, 1], options: [{ idx: 10, kind: "card", id: 74, warnings: [{ code: "opponent-event", params: { card: 74, side: "US" } }] }] });
  const base = { prompt: ar, humanSide: "USSR" as const, space: { US: 3, USSR: 2 }, effectiveOps: 2, spaceBoxes: boxes };

  it("event side, effective Ops, the next space box, warnings", () => {
    const { notes, warnings } = cardPlayNotes({ ...base, card: 74 });
    expect(notes.map(n => n.kind)).toEqual(["event", "ops", "space"]);
    expect(renderEnglish(notes[0]!.value as never)).toBe("Fires for the US");
    expect(notes[1]!.value).toBe("2");
    expect(renderEnglish(notes[2]!.value as never)).toBe("Box 2 → 3 · roll 1–3");
    expect(renderEnglish(notes[2]!.detail!)).toBe("Needs 2 Ops");
    expect(warnings.map(w => w.code)).toEqual(["opponent-event"]);
  });

  it("nothing for cards the prompt is not about; no event/ops for scoring; Asia note for the China Card", () => {
    expect(cardPlayNotes({ ...base, card: 21 }).notes).toEqual([]);
    expect(cardPlayNotes({ ...base, card: 1 }).notes).toEqual([]);
    expect(cardPlayNotes({ ...base, card: 6 }).notes.map(n => n.kind)).toEqual(["event", "ops", "space", "asia"]);
    expect(cardPlayNotes({ ...base, card: 74, prompt: null }).notes).toEqual([]);
    const top = cardPlayNotes({ ...base, card: 74, space: { US: 0, USSR: 8 } });
    expect(top.notes.map(n => n.kind)).toEqual(["event", "ops"]);
  });
});

describe("CardZoomHost / CardSheet", () => {
  it("renders nothing without a zoom", () => {
    const { root, overlays } = mockRoot();
    expect(html(withRoot(h(CardZoomHost, null), root, overlays))).toBe("");
  });

  it("desktop: image, title, meta, text, play notes from the controller, errata label", () => {
    const p = prompt({ kind: "action-card", cards: [74] });
    const { root, overlays } = mockRoot({ zoom: { card: 74, from: null }, prompt: p, effectiveOps: c => (c === 74 ? 2 : null) });
    const out = html(withRoot(h(CardZoomHost, null), root, overlays));
    expect(out).toContain('aria-label="The Voice of America: card details"');
    expect(out).toContain("#74");
    expect(out).toContain("Mid War");
    expect(out).toContain("Remove 4 USSR Influence");
    expect(out).toContain('data-note="ops"');
    expect(out).toContain("Fires for the US");
    expect(out).toContain("Text shown is the current errata");
  });

  it("zh: Chinese text and no errata label with Chinese images", async () => {
    await setLanguage("zh-CN");
    const { root, overlays } = mockRoot({ zoom: { card: 1, from: null } });
    const out = html(withRoot(h(CardZoomHost, null), root, overlays));
    expect(out).toContain("亚洲计分");
    expect(out).toContain("不得持有");
    expect(out).not.toContain("勘误");
    await setLanguage("en");
  });

  it("compact: the card sheet with the given actions", () => {
    const { root, overlays } = mockRoot({ layout: "compact", zoom: { card: 21, from: null } });
    const out = html(withRoot(h(CardZoomHost, { actions: () => h("button", null, "Play this card") }), root, overlays));
    expect(out).toContain('aria-modal="true"');
    expect(out).toContain("NATO");
    expect(out).toContain("Play this card");
    expect(html(h(CardSheet, { card: 21, onClose: () => undefined }))).toContain("NATO");
  });
});
