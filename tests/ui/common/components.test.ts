/**
 * Markup of the common components (react-dom/server; no DOM): roles, labels, variants, languages.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../../../src/i18n";
import {
  Button, CardRef, Die, Dossier, HAMMER_SICKLE_PATH, HoldButton, Icon, ICON_NAMES, PIPS, Popover, RollingNumber, Seal, Sheet,
  SideGlyph, Stamp, STAR_PATH, Toaster, formatNumber, formatSigned, glyphPath, swipeCloses, HAMMER_SICKLE_PATH_LARGE,
} from "../../../src/ui/common";
import { mockRoot, withRoot } from "./mocks";

const html = (el: unknown) => renderToStaticMarkup(el as never);
const h = createElement;

beforeAll(() => { vi.spyOn(console, "error").mockImplementation(() => undefined); });
afterAll(async () => { vi.restoreAllMocks(); await setLanguage("en"); });

describe("glyphs, seals, icons", () => {
  it("uses the spec's paths verbatim", () => {
    expect(STAR_PATH).toBe("M12 1.6l2.9 7.1 7.6.5-5.9 4.9 1.9 7.4L12 17.4l-6.4 4.1 1.9-7.4-5.9-4.9 7.6-.5z");
    expect(HAMMER_SICKLE_PATH.startsWith("M14.6 3.2c3.9 1.1 6.6 4.7 6.6 8.8")).toBe(true);
    expect(glyphPath("USSR", 20)).toBe(HAMMER_SICKLE_PATH);
    expect(glyphPath("USSR", 48)).toBe(HAMMER_SICKLE_PATH_LARGE);
    expect(glyphPath("US", 48)).toBe(STAR_PATH);
  });

  it("SideGlyph is decorative unless titled", () => {
    expect(html(h(SideGlyph, { side: "US" }))).toContain('aria-hidden="true"');
    const titled = html(h(SideGlyph, { side: "USSR", title: "USSR", size: 20 }));
    expect(titled).toContain('role="img"');
    expect(titled).toContain("<title>USSR</title>");
    expect(titled).toContain('width="20"');
  });

  it("Seal names its side in the UI language", async () => {
    expect(html(h(Seal, { side: "US" }))).toContain('aria-label="US"');
    await setLanguage("zh-CN");
    expect(html(h(Seal, { side: "USSR", size: 54 }))).toContain('aria-label="苏联"');
    await setLanguage("en");
  });

  it("every icon renders, decorative", () => {
    for (const name of ICON_NAMES) {
      const out = html(h(Icon, { name }));
      expect(out).toContain(`data-icon="${name}"`);
      expect(out).toContain('aria-hidden="true"');
    }
  });
});

describe("Button / HoldButton / Stamp", () => {
  it("Button: variant, size, pressed, kbd, disabled", () => {
    const out = html(h(Button, { variant: "primary", onPaper: true, kbd: "↵", pressed: true, icon: "undo", onClick: () => undefined }, "Launch coup"));
    expect(out).toContain('type="button"');
    expect(out).toContain('data-variant="primary"');
    expect(out).toContain('aria-pressed="true"');
    expect(out).toMatch(/<kbd[^>]*aria-hidden="true"[^>]*>↵<\/kbd>/);
    expect(out).toContain('data-icon="undo"');
    expect(html(h(Button, { variant: "ghost", disabled: true, onClick: () => undefined }, "x"))).toContain("disabled");
  });

  it("HoldButton: named, described by the hold hint, in both languages", async () => {
    const out = html(h(HoldButton, { label: "This ends the game — you lose", onConfirm: () => undefined }, "This ends the game — you lose"));
    expect(out).toContain('aria-label="This ends the game — you lose"');
    expect(out).toMatch(/aria-describedby="([^"]+)"/);
    expect(out).toContain("Press and hold to confirm");
    expect(out).toContain('pathLength="100"');
    await setLanguage("zh-CN");
    expect(html(h(HoldButton, { label: "x", onConfirm: () => undefined }, "x"))).toContain("按住以确认");
    await setLanguage("en");
  });

  it("HoldButton forwards its ref to the button and can take focus on mount (autoFocus)", () => {
    expect((HoldButton as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for("react.forward_ref"));
    // autoFocus is an effect (focus without scrolling), not the markup attribute.
    expect(html(h(HoldButton, { label: "x", autoFocus: true, onConfirm: () => undefined }, "x"))).not.toContain("autofocus");
  });

  it("Stamp takes its side's class and tilt", () => {
    const out = html(h(Stamp, { side: "USSR", tilt: -6 }, "Your move"));
    expect(out).toContain('data-side="USSR"');
    expect(out).toContain("--stamp-tilt:-6deg");
  });
});

describe("Die / RollingNumber / format", () => {
  it("draws the right pips and names the face", () => {
    for (let f = 1; f <= 6; f++) {
      const out = html(h(Die, { face: f, side: "US" }));
      const on = (out.match(/class="[^"]*pipOn[^"]*"/g) ?? []).length;
      expect(on).toBe(PIPS[f]!.length);
      expect(on).toBe(f);
      expect(out).toContain(`aria-label="US die: ${f}"`);
    }
    expect(html(h(Die, { face: 3, side: "neutral", result: "boom", numeral: true }))).toContain('aria-label="Die: 3, ends the game"');
    expect(html(h(Die, { face: 6, side: "USSR", result: "ok" }))).toContain('aria-label="USSR die: 6, success"');
  });

  it("formats signed numbers with a real minus", () => {
    expect(formatSigned(2)).toBe("+2");
    expect(formatSigned(-3)).toBe("−3");
    expect(formatSigned(0)).toBe("0");
    expect(formatNumber(-1)).toBe("−1");
    const out = html(h(RollingNumber, { value: -2, signed: true }));
    expect(out).toContain("ts-num");
    expect(out).toContain("−2");
  });
});

describe("Popover / Dossier / Sheet / Toaster (server render: in place)", () => {
  it("Popover renders its content with the role and label", () => {
    const out = html(h(Popover, { anchor: null, tone: "paper", label: "Zoom" }, h("p", null, "body")));
    expect(out).toContain('role="dialog"');
    expect(out).toContain('aria-label="Zoom"');
    expect(out).toContain("<p>body</p>");
  });

  it("Dossier is a labelled modal dialog with a close button when closable", () => {
    const out = html(h(Dossier, { tab: "SALT Negotiations", title: "Take a card", onClose: () => undefined, footer: h("button", null, "OK") }, "content"));
    expect(out).toContain('role="dialog"');
    expect(out).toContain('aria-modal="true"');
    const id = out.match(/aria-labelledby="([^"]+)"/)![1];
    expect(out).toContain(`id="${id}"`);
    expect(out).toContain('aria-label="Close"');
    expect(html(h(Dossier, { tab: "t", title: "x" }, "c"))).not.toContain('aria-label="Close"');
  });

  it("Dossier becomes a full-screen sheet on compact layouts", () => {
    const { root, overlays } = mockRoot({ layout: "compact" });
    const out = html(withRoot(h(Dossier, { tab: "t", title: "x" }, "c"), root, overlays));
    expect(out).toMatch(/class="[^"]*full/);
  });

  it("Sheet renders only when open, labelled, with a grab", () => {
    expect(html(h(Sheet, { open: false, onClose: () => undefined, height: "80%", label: "Hand" }, "x"))).toBe("");
    const out = html(h(Sheet, { open: true, onClose: () => undefined, height: "80%", label: "Hand" }, "x"));
    expect(out).toContain('aria-label="Hand"');
    expect(out).toContain('aria-label="Drag down or tap to close"');
  });

  it("swipe closes past a quarter of the sheet / 96 px or when fast", () => {
    expect(swipeCloses(100, 400, 600)).toBe(true);
    expect(swipeCloses(60, 400, 200)).toBe(true);
    expect(swipeCloses(40, 400, 600)).toBe(false);
    expect(swipeCloses(40, 50, 600)).toBe(true);
    expect(swipeCloses(-50, 10, 600)).toBe(false);
  });

  it("Toaster lists the provider's toasts in a polite live region", () => {
    const { root, overlays } = mockRoot({ toasts: [{ id: 1, message: "Deck exhausted", tone: "info", ms: 3000 }, { id: 2, message: "DEFCON 2", tone: "warn", ms: 3000 }] });
    const out = html(withRoot(h(Toaster, null), root, overlays));
    expect(out).toContain('aria-live="polite"');
    expect(out).toContain("Deck exhausted");
    expect(out).toContain('data-tone="warn"');
  });

  it("CardRef asks the root to zoom (and is plain text without one)", () => {
    const { root, overlays } = mockRoot();
    expect(html(withRoot(h(CardRef, { card: 21 }, "NATO"), root, overlays))).toMatch(/role="button"[^>]*aria-haspopup="dialog"/);
    expect(html(h(CardRef, { card: 21 }, "NATO"))).not.toContain("role=");
  });
});

describe("large hammer and sickle", () => {
  it("is a different, well-formed path inside the 24-unit box", () => {
    expect(HAMMER_SICKLE_PATH_LARGE).not.toBe(HAMMER_SICKLE_PATH);
    const nums = HAMMER_SICKLE_PATH_LARGE.replace(/A[\d.\s-]+?(?=\s\d|\s\.)/g, " ").match(/-?\d*\.?\d+/g)!.map(Number);
    expect(nums.length).toBeGreaterThan(20);
    for (const n of nums) expect(n >= 0 && n <= 24).toBe(true);
    expect((HAMMER_SICKLE_PATH_LARGE.match(/z/g) ?? []).length).toBe(4);
  });
});
