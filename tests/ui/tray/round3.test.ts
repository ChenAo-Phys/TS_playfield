/**
 * QA round 3, fix group F3: R3-04 (D-201, the tray half): the compact hand drawer serves the prompt layer's focus
 * request (Esc, close or Back to hand on the play-mode sheet), as `Hand` and `ChinaSlot` do on desktop / tablet.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { drawerFocusCard, handFocusReady, type HandCardState } from "../../../src/ui/tray";
import { FOCUS_TIMEOUT_MS } from "../../../src/ui/prompts/store";

const src = (rel: string) => readFileSync(new URL(`../../../src/ui/${rel}`, import.meta.url), "utf8");

const cards = [14, 21, 3];
const states: HandCardState[] = ["playable", "playable", "playable"];
const open = { open: true, cards, states, china: "faceUp" as const, chinaLifted: false, interactive: true, mode: "active" as const };

describe("R3-04 a hand card is ready for the focus request (handFocusReady, shared by Hand and HandDrawer)", () => {
  it("back in the hand, not on the stage, the hand interactive and choosing again", () => {
    expect(handFocusReady(21, cards, states, { interactive: true, mode: "active" })).toBe(true);
    expect(handFocusReady(null, cards, states, { interactive: true, mode: "active" })).toBe(false);
    expect(handFocusReady(99, cards, states, { interactive: true, mode: "active" })).toBe(false); // not in this hand
    expect(handFocusReady(21, cards, ["playable", "lifted", "playable"], { interactive: true, mode: "active" })).toBe(false);
    expect(handFocusReady(21, cards, states, { interactive: false, mode: "active" })).toBe(false); // the undo frame plays
    expect(handFocusReady(21, cards, states, { interactive: true, mode: "passive" })).toBe(false);
  });
  it("Hand uses it", () => {
    expect(src("tray/Hand.tsx")).toMatch(/const focusReady = handFocusReady\(focusReq, order, states, \{ interactive, mode \}\);/);
  });
});

describe("R3-04 the compact hand drawer's card to focus (drawerFocusCard)", () => {
  it("a hand card once it is back in the open drawer and the hand chooses again", () => {
    expect(drawerFocusCard(21, open)).toBe(21);
    expect(drawerFocusCard(21, { ...open, open: false })).toBeNull(); // the shell opens it first
    expect(drawerFocusCard(null, open)).toBeNull();
    expect(drawerFocusCard(21, { ...open, states: ["playable", "lifted", "playable"] })).toBeNull();
    expect(drawerFocusCard(21, { ...open, interactive: false })).toBeNull();
    expect(drawerFocusCard(21, { ...open, mode: "passive" })).toBeNull();
  });
  it("the China Card (card 6) when the drawer holds it face up and back from the stage", () => {
    expect(drawerFocusCard(6, open)).toBe(6);
    expect(drawerFocusCard(6, { ...open, china: null })).toBeNull(); // not held
    expect(drawerFocusCard(6, { ...open, china: "faceDown" })).toBeNull();
    expect(drawerFocusCard(6, { ...open, chinaLifted: true })).toBeNull();
  });
  it("HandDrawer serves it a frame after the sheet focuses its panel, through the shared serve helper", () => {
    const s = src("tray/HandDrawer.tsx");
    expect(s).toMatch(/const focusReq = useSyncExternalStore\(prompts\.subscribe, \(\) => prompts\.get\(\)\.focusCard, NO_FOCUS\);/);
    expect(s).toMatch(/const focusCard = drawerFocusCard\(focusReq, \{/);
    expect(s).toMatch(/const serve = \(\) => \{ serveFocusRequest\(focusStore, els\.current\.get\(focusCard\) \?\? null\); \};/);
    expect(s).toMatch(/const id = requestAnimationFrame\(serve\);/);
    // the sheet's own mount effect focuses its panel; a child's effects run before it, hence the frame
    expect(src("common/Sheet.tsx")).toMatch(/useEffect\(\(\) => \{ panel\.current\?\.focus\(\{ preventScroll: true \}\); \}, \[\]\);/);
  });
  it("the request outlives the drawer's open animation (3 s against the 380 ms `--ts-dur-m` slide)", () => {
    expect(FOCUS_TIMEOUT_MS).toBeGreaterThanOrEqual(1000);
  });
});
