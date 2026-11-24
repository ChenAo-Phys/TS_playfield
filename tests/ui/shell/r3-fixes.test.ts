/**
 * QA round 3, fix group F4 (shell part; the console / rail part is tests/ui/console/r3-fixes.test.ts): the compact
 * ticker is a 44 px tap strip on touch screens (R3-08); the theatre bar never shows a chip sliver narrower than a
 * finger at rest, its scrolling edges fade, and the compact ☰'s area stays on screen (R3-09); a "Back to hand" focus
 * request opens the compact hand drawer (D-201, R3-10); a game that is not being saved is told once per page
 * (D-203, R3-11). Browser checks: docs/handoff/ui-shell.md "QA round 3".
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { GameController, ViewModel } from "../../../src/game/contract";
import { setLanguage, t } from "../../../src/i18n";
import en from "../../../src/i18n/locales/en/ui_shell.json";
import zh from "../../../src/i18n/locales/zh-CN/ui_shell.json";
import { SAVE_NOTICE_MS, tellSaveUnavailable } from "../../../src/ui/App";
import { CHIP_MIN_VISIBLE, CHIP_PAD, chipPadding, scrollEdges } from "../../../src/ui/compact/TheatreBar";
import { AboutDossier } from "../../../src/ui/screens/AboutDossier";
import { dockForFocus } from "../../../src/ui/screens/GameScreen";
import { createSettingsStore } from "../../../src/ui/state/settings";
import { UiRootProvider } from "../../../src/ui/state/UiRootProvider";

const h = createElement;
const ROOT = join(__dirname, "../../..");
const css = (f: string) => readFileSync(join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const noop = () => undefined;

function stubController(vm: Partial<ViewModel>): GameController {
  const full: ViewModel = {
    status: "playing", humanSide: "USSR", frame: null, queued: 0, prompt: null, aiThinking: false, canUndo: false, log: [], ending: null,
    hasSavedGame: false, ...vm,
  };
  return {
    subscribe: () => () => undefined, getSnapshot: () => full, boot: async () => undefined, newGame: async () => undefined,
    resume: async () => false, choose: () => undefined, undo: () => undefined, resign: () => undefined, ackFrame: () => undefined,
    coupOdds: () => null, effectiveOps: () => null,
  };
}

beforeAll(async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  await setLanguage("en");
});
afterAll(async () => { vi.restoreAllMocks(); await setLanguage("en"); });

describe("compact ticker (R3-08)", () => {
  it("a 44 px tall strip on touch screens that grows on screen (no invisible reach over the map)", () => {
    const compact = css("src/ui/compact/compact.module.css");
    expect(compact).toMatch(/@media \(pointer: coarse\) \{ \.ticker \{ min-height: 44px; \} \}/);
    expect(compact).not.toMatch(/\.ticker::after/);
    expect(compact).toMatch(/\.ticker \{[^}]*display: flex;[^}]*align-items: center;/);
  });
});

describe("theatre chips (R3-09)", () => {
  // At 360 px in Chinese with no prompt: 欧洲 中东 亚洲 东南亚 非洲 中美洲 南美洲 ⤢ 全图 at the base 9 px padding.
  const zh360 = [44, 44, 44, 57, 44, 57, 57, 61];
  const lefts = (widths: number[], pad: number, start = 8, gap = 5) => {
    const out: number[] = [];
    let x = start;
    for (const w of widths) { out.push(x); x += w + 2 * (pad - CHIP_PAD.base) + gap; }
    return out;
  };

  it("a sliver under 44 px pulls the chips together until the cut chip shows 44 px (南美洲: 32 → 44 px at 360 zh)", () => {
    expect(360 - lefts(zh360, CHIP_PAD.base)[6]!).toBe(32);
    const pad = chipPadding(zh360, 360);
    expect(pad).toBe(8);
    expect(360 - lefts(zh360, pad)[6]!).toBeGreaterThanOrEqual(CHIP_MIN_VISIBLE);
  });

  it("when pulling would need more than 3 px a side, the chips spread until the cut chip starts at the edge", () => {
    // Five chips with counts (67–80 px) at 390: C. America shows 9 px.
    const counted = [67, 67, 67, 80, 67, 80, 80, 61];
    expect(390 - lefts(counted, 9)[5]!).toBe(9);
    const pad = chipPadding(counted, 390);
    expect(pad).toBeGreaterThan(CHIP_PAD.base);
    expect(pad).toBeLessThanOrEqual(CHIP_PAD.hi);
    expect(lefts(counted, pad)[5]!).toBeGreaterThanOrEqual(390);
  });

  it("no cut chip, or one that already shows 44 px: the base padding; the first chip cut: the base too", () => {
    expect(chipPadding(zh360, 600)).toBe(CHIP_PAD.base);
    expect(chipPadding(zh360, 380)).toBe(CHIP_PAD.base); // 南美洲 shows 52 px
    expect(chipPadding([400], 360)).toBe(CHIP_PAD.base);
  });

  it("the result stays in 6–12 px, on quarter pixels", () => {
    for (let view = 200; view <= 700; view += 7) {
      const pad = chipPadding(zh360, view);
      expect(pad).toBeGreaterThanOrEqual(CHIP_PAD.lo);
      expect(pad).toBeLessThanOrEqual(CHIP_PAD.hi);
      expect(pad * 4).toBe(Math.round(pad * 4));
    }
  });

  it("scroll edges: which ends have more chips beyond them (the bar fades those)", () => {
    expect(scrollEdges(0, 360, 360)).toBeNull();
    expect(scrollEdges(0, 360, 620)).toBe("end");
    expect(scrollEdges(120, 360, 620)).toBe("both");
    expect(scrollEdges(260, 360, 620)).toBe("start");
    expect(scrollEdges(259.5, 360, 620)).toBe("start");
    const compact = css("src/ui/compact/compact.module.css");
    for (const k of ["end", "start", "both"]) expect(compact).toMatch(new RegExp(`\\.theatres\\[data-more="${k}"\\] \\{ mask-image: linear-gradient`));
    expect(compact).toMatch(/\.chip \{[^}]*padding: 0 var\(--chip-pad, 9px\);/);
  });

  it("the compact ☰'s 44 × 44 area starts at the bar's top in the 44 px landscape bar (it measured 44 × 43.5)", () => {
    const con = css("src/ui/console/Console.module.css");
    const coarse = con.slice(con.indexOf("@media (pointer: coarse)"));
    const [top, side, bottom] = coarse.match(/\.iconBtnTouch::after \{ inset: -([\d.]+)px -([\d.]+)px -([\d.]+)px; \}/)!.slice(1).map(Number);
    // The 40 px button is centred in the 43 px content box of the 44 px bar (1 px border): it starts 1.5 px down.
    const btnTop = (44 - 1 - 40) / 2;
    expect(btnTop - top!).toBe(0);
    expect(40 + top! + bottom!).toBe(44);
    expect(40 + 2 * side!).toBe(44);
  });
});

describe("Back to hand on compact (D-201, R3-10)", () => {
  it("a focus request opens the hand drawer on compact layouts, over any other dock sheet", () => {
    expect(dockForFocus(true, 21, null)).toBe("hand");
    expect(dockForFocus(true, 21, "log")).toBe("hand");
    expect(dockForFocus(true, 21, "hand")).toBe("hand");
  });
  it("no request, or a desktop / tablet layout (the tray's hand serves it): the dock stays", () => {
    expect(dockForFocus(true, null, null)).toBeNull();
    expect(dockForFocus(true, null, "status")).toBe("status");
    expect(dockForFocus(false, 21, null)).toBeNull();
  });
  it("the game screen wires it to the prompt store and moves no focus itself", () => {
    const src = readFileSync(join(ROOT, "src/ui/screens/GameScreen.tsx"), "utf8");
    expect(src).toMatch(/const focusCard = usePromptUi\("focusCard"\);\s*useEffect\(\(\) => \{ setDock\(d => dockForFocus\(compact, focusCard, d\)\); \}, \[compact, focusCard\]\);/);
  });
});

describe("a game that is not being saved (D-203, R3-11)", () => {
  it("is told once per page: not again when the condition clears and comes back", () => {
    const told = { current: false };
    expect(tellSaveUnavailable(undefined, told)).toBe(false);
    expect(tellSaveUnavailable(false, told)).toBe(false);
    expect(tellSaveUnavailable(true, told)).toBe(true);
    expect(tellSaveUnavailable(true, told)).toBe(false);
    expect(tellSaveUnavailable(false, told)).toBe(false);
    expect(tellSaveUnavailable(true, told)).toBe(false);
    expect(told.current).toBe(true);
  });

  it("plainly, in English and Chinese (an info toast that stays long enough to read)", async () => {
    expect(en.save.unavailable).toBe("This browser isn't saving the game: it will be lost if you close or reload the page.");
    expect(zh.save.unavailable).toBe("此浏览器无法保存对局：关闭或刷新页面后对局将丢失。");
    expect(t("ui_shell:save.unavailable")).toBe(en.save.unavailable);
    await setLanguage("zh-CN");
    try { expect(t("ui_shell:save.unavailable")).toBe(zh.save.unavailable); } finally { await setLanguage("en"); }
    await setLanguage("en-XA");
    try { expect(t("ui_shell:save.unavailable")).toMatch(/^⟦.*⟧$/); } finally { await setLanguage("en"); }
    const app = readFileSync(join(ROOT, "src/ui/App.tsx"), "utf8");
    expect(app).toMatch(/root\.toast\(t\("ui_shell:save\.unavailable"\), \{ tone: "info", ms: SAVE_NOTICE_MS \}\)/);
    expect(SAVE_NOTICE_MS).toBeGreaterThanOrEqual(8000);
  });

  it("the About dialog's save line says so while it holds", () => {
    const render = (vm: Partial<ViewModel>) => renderToStaticMarkup(
      h(UiRootProvider, { controller: stubController(vm), settingsStore: createSettingsStore(null, {}), layout: "desktop", rootAttributes: false },
        h(AboutDossier, { onClose: noop })),
    );
    const html = (s: string) => s.replace(/'/g, "&#x27;");
    expect(render({ saveUnavailable: true })).toContain(html(`${en.about.save} ${en.save.aboutNow}`));
    expect(render({})).not.toContain(html(en.save.aboutNow));
    expect(renderToStaticMarkup(h(AboutDossier, { onClose: noop }))).not.toContain(html(en.save.aboutNow));
  });
});
