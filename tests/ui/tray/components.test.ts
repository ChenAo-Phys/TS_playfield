/**
 * Tray components rendered with react-dom/server on recorded fixtures (en / zh): Tray (hand states,
 * tags, staged stamps, lifted-out card, China slot, piles, headline slot, anchors), HandDrawer, and the
 * pieces on their own.
 */
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../../../src/i18n";
import type { PublicState } from "../../../src/game/contract";
import { readFileSync } from "node:fs";
import { ChinaSlot, HandCard, HandDrawer, HeadlineSlot, Piles, Tray } from "../../../src/ui/tray";
import { fixture } from "../../fixtures/load";
import { env, offeredOf, wrap, type TrayEnv } from "./helpers";

const html = (el: unknown) => renderToStaticMarkup(el as never);
const noop = () => undefined;

function tray(e: TrayEnv, o: { staged?: number | null; variant?: "desktop" | "tablet"; offered?: ReturnType<typeof offeredOf> } = {}) {
  return html(wrap(e, h(Tray, {
    variant: o.variant ?? "desktop", slip: h("div", { "data-slip": "" }, "SLIP"), offered: o.offered ?? offeredOf(e.prompt),
    staged: o.staged ?? null, onActivateCard: noop, onOpenPile: noop,
  })));
}
const stateOf = (markup: string, card: number) => markup.match(new RegExp(`data-card="${card}" data-state="([a-z]+)"`))?.[1];

beforeAll(() => { vi.spyOn(console, "error").mockImplementation(() => undefined); });
afterAll(async () => { vi.restoreAllMocks(); await setLanguage("en"); });

describe("Tray at an action-card prompt", () => {
  it("renders the slip, the hand in order with playable cards, the China slot and the piles", async () => {
    await setLanguage("en");
    const e = env("prompt-action-card-china");
    const out = tray(e);
    expect(out).toContain("data-slip");
    expect(out).toContain('data-mode="active"');
    // Hand order: scoring first, then Ops descending, then id.
    const order = [...out.matchAll(/data-card="(\d+)" data-state=/g)].map(m => Number(m[1]));
    expect(order).toEqual([1, 21, 31, 25, 28, 105, 26, 6]);
    for (const c of [1, 21, 25, 26, 28, 31, 105]) expect(stateOf(out, c)).toBe("playable");
    expect(stateOf(out, 6)).toBe("playable");
    expect(out).toContain("Your hand · 7");
    expect(out).toContain(">China Card · face up<");
    expect(out).toContain(">Deck<");
    expect(out).toContain(">Discard<");
    expect(out).toContain(">Removed<");
    expect(out).toContain('aria-label="Draw pile: 15 cards"');
    expect(out).toContain('aria-label="Removed from play: 9 cards. Show them"');
  });
  it("tags: SCORING, KNOWN TO AI from the redacted locations", () => {
    const out = tray(env("prompt-action-card-china"));
    expect(out.match(/data-tone="scoring"/g)?.length).toBe(1);
    // 21, 25, 26, 31, 105 are HAND_USSR_KNOWN; 1 and 28 are not.
    expect(out.match(/data-tone="known"/g)?.length).toBe(5);
    expect(out).toContain("Known to AI");
  });
  it("accessible names carry the card, its Ops and its state", () => {
    const out = tray(env("prompt-action-card-china"));
    expect(out).toContain('aria-label="NATO, 4 Ops. Playable. Known to the AI"');
    expect(out).toContain('aria-label="CIA Created, 1 Op. Playable. Known to the AI"');
    expect(out).toContain('aria-label="Suez Crisis, 3 Ops. Playable"');
    expect(out).toContain('aria-label="Asia Scoring, Scoring card. Playable"');
    expect(out).toContain('aria-label="The China Card, face up. Playable"');
  });
  it("registers the anchors the flights use", () => {
    const e = env("prompt-action-card-china");
    tray(e);
    for (const id of ["hand:USSR", "china:USSR", "deck", "discard", "removed", "card:21", "card:105"]) expect(e.calls.anchors).toContain(id);
  });
  it("a staged card lifts with its verb stamp; a scoring-stranded option carries its hazard tag", () => {
    const e = env("prompt-action-card-warning");
    expect(e.prompt?.options.find(o => o.id === 27)?.warnings?.[0]?.code).toBe("scoring-stranded");
    const out = tray(e, { staged: 27 });
    expect(stateOf(out, 27)).toBe("staged");
    expect(out).toContain(">Play<");
    expect(out).toContain("Strands a scoring card");
    expect(stateOf(out, 3)).toBe("playable");
  });
  it("unplayable cards dim when only some are offered", () => {
    const e = env("prompt-action-card-china");
    const offered = offeredOf(e.prompt);
    offered.delete(25);
    offered.delete(6);
    const out = tray(e, { offered });
    expect(stateOf(out, 25)).toBe("unplayable");
    expect(out).toContain('aria-label="Containment, 3 Ops. Can&#x27;t be played now. Known to the AI"');
    expect(stateOf(out, 6)).toBe("passive");
  });
});

describe("Tray in other moments", () => {
  it("play-mode: the chosen card is lifted out, the rest passive", () => {
    const e = env("prompt-play-mode");
    const out = tray(e);
    expect(e.prompt?.pendingCard).toBe(28);
    expect(stateOf(out, 28)).toBe("lifted");
    expect(stateOf(out, 21)).toBe("passive");
    expect(out).toContain('data-mode="passive"');
  });
  it("headline: a staged card reads HEADLINE", () => {
    const out = tray(env("prompt-headline"), { staged: 31 });
    expect(stateOf(out, 31)).toBe("staged");
    expect(out).toContain(">Headline<");
  });
  it("no prompt and idle: neutral; frames animating: passive and inert", () => {
    const idle = tray(env("prompt-action-card", { vm: { prompt: null } }));
    expect(idle).toContain('data-mode="neutral"');
    const busy = tray(env("prompt-action-card", { vm: { prompt: null }, shown: { busy: true, actor: "US" } }));
    expect(busy).toContain('data-mode="passive"');
  });
  it("the China Card with the AI: an outline; face down with you: not playable, with the hint", () => {
    const withAi = tray(env("prompt-action-card"));
    expect(withAi).toContain('data-view="withAi"');
    expect(withAi).toContain(">With the US<");
    expect(withAi).toContain("The China Card is with the United States, face down");
    const down = tray(env("prompt-action-card-warning"));
    expect(down).toContain('data-view="faceDown"');
    expect(down).toContain('title="Cannot be played until next turn"');
    expect(down).toContain(">China Card · face down<");
    expect(down).toContain('data-face="down"');
  });
  it("the headline slot: the committed card face down with COMMITTED, at the left of the hand", () => {
    const fx = fixture("seq-headline");
    const st = { ...fx.frames[1]!.state, headline_stage: 0 } as PublicState;
    const e = env("seq-headline", { state: st, vm: { prompt: null } });
    const out = tray(e);
    expect(out).toContain(">Committed<");
    expect(out).toContain('aria-label="Your headline: Captured Nazi Scientist (committed, face down)"');
    expect(out.indexOf(">Committed<")).toBeLessThan(out.indexOf('data-hand-card'));
    expect(e.calls.anchors).toContain("headline:USSR");
    const revealed = tray(env("seq-headline", { state: fx.frames[1]!.state, vm: { prompt: null } }));
    expect(revealed).toContain(">Revealed<");
  });
  it("tablet: 86 px cards, 78 px China Card", () => {
    const out = tray(env("prompt-action-card-china"), { variant: "tablet" });
    expect(out).toContain("width:86px;height:120px");
    expect(out).toContain("width:78px;height:109px");
  });
  it("Chinese", async () => {
    await setLanguage("zh-CN");
    const out = tray(env("prompt-action-card-china"), { staged: 21 });
    expect(out).toContain("你的手牌 · 7");
    expect(out).toContain(">中国牌 · 正面朝上<");
    expect(out).toContain(">抽牌堆<");
    expect(out).toContain(">弃牌堆<");
    expect(out).toContain(">移出游戏<");
    expect(out).toContain(">打出<");
    expect(out).toContain('aria-label="北约，4 行动点。已选中：再次点击或按回车确认。AI 已知"');
    await setLanguage("en");
  });
});

describe("HandDrawer (compact)", () => {
  it("open: header with count and China status, 112 px cards with captions, the China Card last", async () => {
    await setLanguage("en");
    const e = env("prompt-action-card-china", { layout: "compact" });
    const out = html(wrap(e, h(HandDrawer, { open: true, onClose: noop, offered: offeredOf(e.prompt), staged: null, onActivateCard: noop })));
    expect(out).toContain("Your hand · 7");
    expect(out).toContain("China Card: yours");
    expect(out).toContain("width:112px;height:157px");
    const order = [...out.matchAll(/data-card="(\d+)" data-state=/g)].map(m => Number(m[1]));
    expect(order[order.length - 1]).toBe(6);
    expect(stateOf(out, 21)).toBe("playable");
    expect(e.calls.anchors).toContain("hand:USSR");
  });
  it("an in-hand card choice: the drawer header carries the question and its done button (QA Q-028)", async () => {
    await setLanguage("en");
    const base = env("prompt-action-card-china", { layout: "compact" });
    const hand = base.state.hands[base.state.humanSide];
    const done = { idx: 208, kind: "done" as const, id: 0, endsPlay: true };
    const prompt = {
      ...base.prompt!, kind: "event-card" as const, resolvingCard: 10, pendingCard: 0, promptId: 999,
      title: { key: "prompt:card.10.card" }, detail: { key: "prompt:card.10.detail" },
      options: [...hand.slice(0, 2).map((id, i) => ({ idx: 300 + i, kind: "card" as const, id })), done], cards: hand.slice(0, 2), done, doneMeaning: "decline" as const,
    };
    const e = env("prompt-action-card-china", { layout: "compact", vm: { prompt } });
    const out = html(wrap(e, h(HandDrawer, { open: true, onClose: noop, offered: offeredOf(prompt), staged: null, onActivateCard: noop })));
    expect(out).toContain("data-hand-prompt");
    expect(out).toContain("Blockade: discard a card worth 3 or more Ops");
    expect(out).toMatch(/Discard nothing — lose[^<]*West Germany/);
    expect(out).toContain("Your hand · 7");
    // no hand prompt (e.g. the drawer opened from the dock during an influence prompt): no bar
    const other = env("prompt-influence", { layout: "compact" });
    expect(html(wrap(other, h(HandDrawer, { open: true, onClose: noop, offered: new Map(), staged: null, onActivateCard: noop })))).not.toContain("data-hand-prompt");
  });
  it("closed: nothing rendered", () => {
    const e = env("prompt-action-card-china", { layout: "compact" });
    expect(html(wrap(e, h(HandDrawer, { open: false, onClose: noop, offered: new Map(), staged: null, onActivateCard: noop })))).toBe("");
  });
  it("Chinese header", async () => {
    await setLanguage("zh-CN");
    const e = env("prompt-action-card", { layout: "compact" });
    const out = html(wrap(e, h(HandDrawer, { open: true, onClose: noop, offered: offeredOf(e.prompt), staged: null, onActivateCard: noop })));
    expect(out).toContain("你的手牌 · 4");
    expect(out).toContain("中国牌：在 AI 手中 · 正面朝下");
    await setLanguage("en");
  });
});

describe("pieces", () => {
  it("Piles: empty piles show an outline; the panel variant", () => {
    const e = env("prompt-action-card-china");
    const out = html(wrap(e, h(Piles, { deck: 0, discard: [], removed: [5], onOpen: noop, variant: "panel" })));
    expect(out).toContain('aria-label="Discard pile: 0 cards. Show them"');
    expect(out).toContain('aria-label="Removed from play: 1 card. Show it"');
    expect(out).toMatch(/cards\/en\/005\.webp/);
  });
  it("ChinaSlot / HeadlineSlot alone", () => {
    const e = env("prompt-action-card-china");
    const china = html(wrap(e, h(ChinaSlot, { china: { holder: "USSR", playable: true }, humanSide: "USSR", policy: null, onActivate: noop, mode: "neutral" })));
    expect(china).toContain('data-state="neutral"');
    expect(html(wrap(e, h(HeadlineSlot, { card: null, faceDown: true })))).toBe("");
  });
});

describe("spines (QA OD-3)", () => {
  const card = (o: { spine?: boolean; state?: "playable" | "unplayable" | "staged" | "lifted"; known?: boolean } = {}) => {
    const e = env("prompt-action-card-china");
    return html(wrap(e, h(HandCard, { card: 31, state: o.state ?? "playable", overlapRight: 57, spine: o.spine, onActivate: noop, known: o.known })));
  };
  it("an overlapped card carries its name down a spine; the accessible name is unchanged", () => {
    const out = card({ spine: true });
    expect(out).toContain('data-spine="true"');
    expect(out).toMatch(/<span class="[^"]*spine[^"]*spine_neutral[^"]*" aria-hidden="true"><span class="[^"]*spineText[^"]*">Red Scare\/Purge<\/span><\/span>/);
    expect(out).toContain('aria-label="Red Scare/Purge, 4 Ops. Playable"');
    // The Ops badge stays (caption), and the card is still a button with the card id.
    expect(out).toMatch(/ops_neutral[^"]*"[^>]*>4</);
    expect(out).toContain('data-card="31"');
  });
  it("no spine without the flag (the rightmost card, a roomy hand)", () => {
    const out = card();
    expect(out).not.toContain("data-spine");
    expect(out).not.toMatch(/class="[^"]*spineText/);
  });
  it("Chinese: the spine holds the Chinese name (its slash upright, QA R-013)", async () => {
    await setLanguage("zh-CN");
    expect(card({ spine: true })).toMatch(/spineText[^"]*">红色恐慌／大清洗</);
    await setLanguage("en");
  });
  it("dimmed and staged cards keep their spine element (CSS dims it / swaps it for the caption)", () => {
    expect(card({ spine: true, state: "unplayable" })).toContain('data-dim="unplayable"');
    expect(card({ spine: true, state: "unplayable" })).toContain('data-spine="true"');
    const staged = card({ spine: true, state: "staged" });
    expect(staged).toContain('data-state="staged"');
    expect(staged).toContain('data-spine="true"');
  });
  it("Hand.module.css: a hovered / focused / staged card shows its caption instead (--spine-on: 0)", () => {
    const css = readFileSync(new URL("../../../src/ui/tray/Hand.module.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const rule = css.match(/([^{}]+)\{[^}]*--spine-on:\s*0[^}]*\}/);
    expect(rule).toBeTruthy();
    expect(rule![1]).toMatch(/:hover/);
    expect(rule![1]).toMatch(/:focus-visible/);
    expect(rule![1]).toMatch(/st_staged/);
  });
});
