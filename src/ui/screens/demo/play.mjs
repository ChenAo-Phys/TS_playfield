#!/usr/bin/env node
// Play-through driver (dev only; QA). Drives the real app in Chromium (or Firefox / WebKit: --browser) by clicking
// (or, with --touch, tapping) the real UI: map boxes, hand cards, play-mode rows, dossier tiles, slip buttons (keyboard
// only where the UI offers it: Enter to confirm a staged choice, D for done, Z for undo, Enter on a focused map box it
// cannot reach by pointer).
// It reads the view model through the dev-only `window.__tsp` hook to decide what to click, never to answer.
//
// What to click: `--policy ai` (default) asks the dev-only autopilot (`window.__tspAuto`, src/dev/autopilot.ts) for
// the option the AI would choose for your side, so games run to turn 10 and final scoring; `--policy random` plays
// randomly while exercising coups, realignments, events and scoring cards (games end by turn 2-3).
//
//   TSP_VITE_CACHE=node_modules/.vite-5189 npx vite --port 5189 --strictPort &
//     (for a whole game while others edit the code, use a config with server: { hmr: false, watch: null } spread over
//      vite.config.ts, or an edit reloads the page mid-game: docs/handoff/ai.md "The play-through driver")
//   source scripts/pw-env.sh
//   node src/ui/screens/demo/play.mjs --side USSR --until end [--policy ai|random] [--auto policy|full] [--game-seed n]
//        [--lang en] [--w 1440 --h 900] [--touch] [--undo] [--switch-lang] [--reload] [--resign] [--shots dir]
//        [--speed fast] [--url …] [--seed n] [--max n] [--json file] [--browser chromium|firefox|webkit]
//
//   --until N|end   stop when turn N starts (default 3), or play until the game is over
//   --game-seed n   dev ?seed=n: the controller's random source is seeded (game seed, the coin of --side random);
//                   with ?ai=policy and --policy ai the whole game replays exactly
//   --auto full     the autopilot runs the full leaderboard search instead of the network's argmax (slow)
//   --touch         a touch device (hasTouch + isMobile): taps instead of clicks, no hover (default below 700 px)
//   --browser b     chromium (default), firefox or webkit (Playwright's builds; on this machine see scripts/pw-env.sh).
//                   All three take hasTouch + isMobile and touchscreen.tap; only Chromium has CDP, so elsewhere a touch
//                   hold (1.6 s) is a synthetic touch PointerEvent pair (counted as "synthHold").
//   --seed n        the driver's own random choices (--policy random; dialog picks)
//   --json file     write the result summary as JSON
//
// Exit code 1 when the UI failed to answer a prompt (a fallback was needed), the UI answered with another option than
// the one pressed for (a mismatch: the driver spies on `__tsp.choose`), the page logged errors, or it stalled.
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, firefox, webkit } from "playwright";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d; };
const flag = k => args.includes(`--${k}`);
const URL = opt("url", "http://localhost:5189/TS_playfield/");
const SIDE = opt("side", "USSR");
const UNTIL_ARG = opt("until", "3");
const UNTIL = UNTIL_ARG === "end" ? Infinity : Number(UNTIL_ARG);
const LANG = opt("lang", "en");
const W = Number(opt("w", "1440")), H = Number(opt("h", "900"));
const SPEED = opt("speed", "fast");
const SHOTS = opt("shots", "");
const AI = opt("ai", "policy");
const POLICY = opt("policy", "ai");
const AUTO = opt("auto", "policy");
const GAME_SEED = opt("game-seed", "");
const TOUCH = flag("touch") || W < 700;
const JSON_OUT = opt("json", "");
const BROWSER = opt("browser", "chromium");
const ENGINES = { chromium, firefox, webkit };
if (!ENGINES[BROWSER]) throw new Error(`--browser chromium|firefox|webkit, not ${BROWSER}`);
const MAX_STEPS = Number(opt("max", UNTIL === Infinity ? "6000" : "900"));
if (!["ai", "random"].includes(POLICY)) throw new Error(`--policy ai|random, not ${POLICY}`);
let rngState = Number(opt("seed", String(Date.now() % 100000)));
const rnd = () => { rngState = (rngState * 1103515245 + 12345) % 2147483648; return rngState / 2147483648; };
const pick = arr => arr[Math.floor(rnd() * arr.length)];

const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);
const errors = [];
let reloading = false;
const fallbacks = [];
const done = new Set();
/** How each answer went through the UI. */
const via = { click: 0, tap: 0, key: 0, hold: 0, synthHold: 0, dialog: 0 };
/** AI mode: answers whose option is not the autopilot's own pick (its pick was not an option; logged by it). */
const autoFallbacks = [];

const browser = await ENGINES[BROWSER].launch();
/** A context; `isMobile` is retried without where a Playwright build does not support it (Firefox before 1.5x). */
async function newContext(o) {
  try { return await browser.newContext(o); } catch (e) {
    if (!o.isMobile || !/isMobile/.test(String(e))) throw e;
    log(`${BROWSER}: no isMobile (${String(e).split("\n")[0].slice(0, 100)}); hasTouch only`);
    return browser.newContext({ ...o, isMobile: false });
  }
}
const ctx = await newContext({ viewport: { width: W, height: H }, hasTouch: TOUCH, isMobile: TOUCH, deviceScaleFactor: 1 });
const page = await ctx.newPage();
/** The wall-clock time of an error (matches the log's timestamps). */
const at = () => `[${new Date().toISOString().slice(11, 19)}]`;
page.on("pageerror", e => errors.push(`${at()} pageerror: ${e}`));
page.on("console", m => {
  if (m.type() === "error") {
    // Firefox's text() of console.error(err) is only "Error": add the arguments' messages.
    const i = errors.push(`${at()} console.error: ${m.text()}`) - 1;
    Promise.all(m.args().map(a => a.evaluate(v => (v instanceof Error ? `${v.name}: ${v.message} @ ${(v.stack ?? "").split("\n").slice(0, 3).join(" | ")}` : typeof v === "object" ? "" : String(v))).catch(() => "")))
      .then(xs => { const more = xs.filter(Boolean).join(" ").slice(0, 600); if (more && !errors[i].includes(more)) errors[i] += ` (${more})`; });
  }
  if (m.type() === "warning" && m.text().startsWith("[autopilot]")) log(m.text());
});
if (flag("trace")) {
  const t0 = Date.now();
  const ts = () => ((Date.now() - t0) / 1000).toFixed(1);
  page.on("request", r => { if (/\.wasm|\.onnx|worker/.test(r.url())) log("trace", ts(), "req", r.url().split("/").pop().slice(0, 50)); });
  page.on("console", m => { if (m.type() === "warning" || m.type() === "warn") log("trace", ts(), "warn", m.text().slice(0, 300)); });
  page.on("requestfailed", r => log("trace", ts(), "FAILED", r.url().split("/").pop(), r.failure()?.errorText));
}
/** A request the page itself dropped by reloading (Chromium net::ERR_ABORTED, Firefox NS_BINDING_ABORTED, WebKit "cancelled"). */
const ABORTED = /ERR_ABORTED|NS_BINDING_ABORTED|cancell?ed/i;
page.on("requestfailed", r => { if (!r.url().includes("favicon") && !(reloading && ABORTED.test(r.failure()?.errorText ?? ""))) errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`); });

const params = new URLSearchParams({ lang: LANG });
if (AI) params.set("ai", AI);
if (AUTO !== "policy") params.set("auto", AUTO);
if (GAME_SEED) params.set("seed", GAME_SEED);
await page.goto(`${URL}?${params}`, { waitUntil: "load" });
await page.waitForFunction(() => window.__tsp && window.__tsp.getSnapshot().status === "menu", null, { timeout: 30000 });
// Let the first load finish booting (engine, AI worker) before the reload below: WebKit logs every module load it
// cancels in a dying worker as a console error ("Cannot load … due to access control checks").
await page.waitForFunction(() => document.querySelector("[role=progressbar]")?.getAttribute("aria-valuenow") === "100", null, { timeout: 30000 }).catch(() => {});
await page.evaluate(([speed]) => {
  localStorage.removeItem("ts-playfield.game.v1");
  localStorage.setItem("ts-playfield.ui.v1", JSON.stringify({ speed }));
}, [SPEED]);
reloading = true;
await page.reload({ waitUntil: "load" });
reloading = false;
await page.waitForFunction(() => window.__tsp && window.__tsp.getSnapshot().status === "menu", null, { timeout: 30000 });

/**
 * Record what the UI chose: `window.__tspChosen[promptId] = idx` for every `choose` call (the UI's and a fallback's),
 * so an answer the UI gave for another option than the one meant (a mis-tap, a wrong target) is caught.
 */
async function spyOnChoose() {
  await page.evaluate(() => {
    const c = window.__tsp;
    if (c.__spied) return;
    const orig = c.choose.bind(c);
    window.__tspChosen = {};
    c.choose = (pid, idx) => { window.__tspChosen[pid] = idx; return orig(pid, idx); };
    c.__spied = true;
  });
}
await spyOnChoose();
const mismatches = [];

/** AI mode: the autopilot is installed (a dynamic import) and its model loaded. */
async function autopilotReady() {
  if (POLICY !== "ai") return;
  const t = Date.now();
  await page.waitForFunction(() => !!window.__tspAuto, null, { timeout: 30000 });
  await page.evaluate(() => window.__tspAuto.ready());
  log(`autopilot ready (${await page.evaluate(() => window.__tspAuto.search)}) in ${Date.now() - t} ms`);
}
await autopilotReady();

if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async name => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

async function vm() {
  return page.evaluate(() => {
    const v = window.__tsp.getSnapshot();
    const st = v.frame?.state;
    const p = v.prompt;
    return {
      status: v.status, human: v.humanSide, canUndo: v.canUndo, ai: v.aiThinking, queued: v.queued, seq: v.frame?.seq ?? 0,
      turn: st?.turn ?? 0, ar: st?.action_round ?? 0, phase: st?.current_phase_name, defcon: st?.defcon, vp: st?.victory_points,
      hand: v.humanSide && st ? st.hands[v.humanSide] : [], ending: v.ending,
      prompt: p && {
        kind: p.kind, id: p.promptId, remaining: p.remaining, opsValue: p.opsValue, resolvingCard: p.resolvingCard, pendingCard: p.pendingCard,
        doneMeaning: p.doneMeaning ?? null,
        options: p.options.map(o => ({ idx: o.idx, kind: o.kind, id: o.id, cost: o.cost, endsPlay: o.endsPlay, warn: (o.warnings ?? []).map(w => w.code + (w.params?.faces !== undefined ? `:${w.params.faces}` : "")) })),
      },
    };
  });
}

const SCORING = new Set([1, 2, 3, 37, 38, 79, 81]);
const FATAL = o => o.warn.some(w => /^(defcon-suicide|cmc-suicide|game-ending)/.test(w));
const safe = opts => { const ok = opts.filter(o => !FATAL(o)); return ok.length ? ok : opts; };

/** --policy random: which option to take, by kind (exercise coups, realignments, events with targets, scoring). */
function chooseRandom(v) {
  const p = v.prompt;
  const opts = safe(p.options);
  const by = k => opts.filter(o => o.kind === k);
  switch (p.kind) {
    case "headline":
    case "action-card": {
      const cards = by("card");
      const scoring = cards.filter(o => SCORING.has(o.id));
      if (scoring.length) return scoring[0];
      const nonChina = cards.filter(o => o.id !== 6);
      return cards.length ? pick(nonChina.length ? nonChina : cards) : opts[0];
    }
    case "play-mode":
    case "op-mode": {
      const m = by(p.kind === "play-mode" ? "mode" : "op-mode");
      const key = o => (p.kind === "play-mode" ? ["event", "space", "influence", "coup", "realign"][o.id] : ["influence", "coup", "realign"][o.id]);
      const want = ["coup", "realign", "event", "influence"].filter(k => !done.has(k === "event" ? "eventMode" : k));
      for (const k of want) { const o = m.find(x => key(x) === k); if (o) return o; }
      const weights = { influence: 4, event: 3, coup: 1, realign: 1, space: 1 };
      const pool = m.flatMap(o => Array(weights[key(o)] ?? 1).fill(o));
      return pool.length ? pick(pool) : opts[0];
    }
    case "realign-target": {
      if (done.has("realign") && p.options.some(o => o.kind === "done")) return p.options.find(o => o.kind === "done");
      return pick(by("country")) ?? opts[0];
    }
    case "coup-target": return pick(by("country")) ?? opts[0];
    case "setup-place": case "bid-place": case "influence": {
      const c = by("country");
      const cheap = c.filter(o => (o.cost ?? 1) <= 1);
      return pick(cheap.length ? cheap : c) ?? opts[0];
    }
    case "event-target": return pick(by("country")) ?? opts[0];
    default: {
      const non = opts.filter(o => o.kind !== "done");
      if (p.kind === "event-card" && p.options.some(o => o.kind === "done") && rnd() < 0.3) return p.options.find(o => o.kind === "done");
      return pick(non.length ? non : opts);
    }
  }
}

/** --policy ai: the autopilot's option for this prompt (null: the prompt changed meanwhile). */
async function chooseAi(v) {
  const s = await page.evaluate(() => window.__tspAuto.suggest());
  if (!s || s.promptId !== v.prompt.id) return null;
  const o = v.prompt.options.find(x => x.idx === s.option.idx);
  if (!o) return null;
  if (s.via !== "ai") autoFallbacks.push(`${v.prompt.kind}#${v.prompt.id} → ${o.kind}:${o.id} (${s.reason})`);
  return o;
}

const MODE_KEY = { mode: ["event", "space", "influence", "coup", "realign"], "op-mode": ["influence", "coup", "realign"] };

/** A point inside country `id`'s box that is on screen and not covered (null: none), sampled over the box. */
async function boxPoint(id) {
  return page.evaluate(cid => {
    for (const el of document.querySelectorAll(`svg[role=application] [data-cid="${cid}"]`)) {
      const r = el.getBoundingClientRect();
      for (const fy of [0.7, 0.5, 0.3, 0.85, 0.15]) {
        for (const fx of [0.5, 0.3, 0.7, 0.15, 0.85]) {
          const x = r.left + r.width * fx, y = r.top + r.height * fy;
          if (x < 1 || y < 1 || x > innerWidth - 1 || y > innerHeight - 1) continue;
          const hit = document.elementFromPoint(x, y);
          if (hit && el.contains(hit)) return { x, y };
        }
      }
    }
    return null;
  }, id);
}

/** Country ids whose box centre is on screen and not covered (the phone map shows a part of the world). */
async function visibleCountries() {
  return page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("svg[role=application] [data-cid]")) {
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height * 0.7;
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
      const hit = document.elementFromPoint(x, y);
      if (hit && el.contains(hit)) out.push({ id: Number(el.getAttribute("data-cid")), x, y });
    }
    return out;
  });
}

/**
 * A point inside the element that is on screen and not covered by another element (null: none), sampled over its box:
 * a hand card in a 9-card fan shows only a sliver beside its neighbours, where Playwright's centre click would land on
 * the neighbour.
 */
async function visiblePoint(el) {
  return el.evaluate(node => {
    const r = node.getBoundingClientRect();
    for (const fy of [0.5, 0.3, 0.15, 0.7, 0.85]) {
      for (const fx of [0.5, 0.15, 0.85, 0.3, 0.7, 0.08, 0.92]) {
        const x = r.left + r.width * fx, y = r.top + r.height * fy;
        if (x < 1 || y < 1 || x > innerWidth - 1 || y > innerHeight - 1) continue;
        const hit = document.elementFromPoint(x, y);
        if (hit && node.contains(hit)) return { x, y };
      }
    }
    return null;
  }).catch(() => null);
}

const GRAB = /^(Drag down or tap to close|向下拖动或点按以关闭)$/;

/**
 * Close the topmost sheet (the compact hand drawer, a card sheet, the log) by tapping its grab, as a player would --
 * unless it holds `el`. False when there is none to close.
 */
async function closeTopSheet(el) {
  const sheet = page.locator("[role=dialog][aria-modal=true]", { has: page.getByRole("button", { name: GRAB }) }).last();
  if (!(await sheet.isVisible().catch(() => false))) return false;
  const handle = el ? await el.elementHandle({ timeout: 500 }).catch(() => null) : null;
  if (handle && await sheet.evaluate((d, n) => d.contains(n), handle).catch(() => false)) return false;
  const grab = sheet.getByRole("button", { name: GRAB }).first();
  const at = await visiblePoint(grab);
  if (at) await pressAt(at.x, at.y); else await page.keyboard.press("Escape");
  await page.waitForTimeout(450);
  return true;
}

/**
 * Click or tap an element at a visible point of it (no hover on touch). One still sliding in is waited for; sheets
 * covering it are closed first.
 */
async function press(el) {
  await el.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  let at = await visiblePoint(el);
  for (let i = 0; !at && i < 6 && await el.count(); i++) { await page.waitForTimeout(150); at = await visiblePoint(el); }
  for (let i = 0; !at && i < 3 && await el.count(); i++) {
    if (!(await closeTopSheet(el))) break;
    at = await visiblePoint(el);
  }
  if (at) { await pressAt(at.x, at.y); return; }
  if (TOUCH) { await el.tap({ timeout: 3000 }); via.tap++; return; }
  await el.hover({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(160);
  await el.click({ timeout: 3000 });
  via.click++;
}
async function pressAt(x, y) {
  if (TOUCH) { await page.touchscreen.tap(x, y); via.tap++; return; }
  await page.mouse.move(x, y);
  await page.waitForTimeout(160);
  await page.mouse.click(x, y);
  via.click++;
}

/**
 * Press and hold (1.6 s) at a point: the mouse, or a touch through CDP on a touch device (Chromium). Firefox and WebKit
 * have no CDP and Playwright's touchscreen only taps: there the hold is a synthetic touch PointerEvent pair on the
 * element under the point (the HoldButton listens to pointer events; isTrusted is false, pointer capture fails quietly).
 */
let cdp = null;
async function holdAt(x, y) {
  if (TOUCH && BROWSER === "chromium") {
    cdp ??= await ctx.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await page.waitForTimeout(1600);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else if (TOUCH) {
    const init = { bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType: "touch", isPrimary: true, clientX: x, clientY: y, button: 0, buttons: 1 };
    await page.evaluate(([px, py, o]) => {
      const el = document.elementFromPoint(px, py);
      window.__tspHoldTarget = el;
      el?.dispatchEvent(new PointerEvent("pointerdown", o));
    }, [x, y, init]);
    await page.waitForTimeout(1600);
    await page.evaluate(o => { window.__tspHoldTarget?.dispatchEvent(new PointerEvent("pointerup", { ...o, buttons: 0 })); window.__tspHoldTarget = null; }, init);
    via.synthHold++;
    return;
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(1600);
    await page.mouse.up();
  }
  via.hold++;
}

/** The hold button of a hold-to-commit choice (the slip's or a dossier's primary), if one is on screen. */
async function holdIfOffered(p) {
  const btn = page.locator("button[aria-describedby]:has(svg rect[pathLength='100'])").last();
  if (!(await btn.isVisible().catch(() => false))) return false;
  const box = await btn.boundingBox();
  if (!box) return false;
  await holdAt(box.x + box.width / 2, box.y + box.height / 2);
  return changed(p.id, 2500);
}

/**
 * The open prompt dossier (a card picker, a branch / DEFCON dossier): the topmost modal dialog. Not "[role=dialog]"
 * alone: the card zoom a hover opens over the picker is a dialog too (non-modal), and so is the play-mode stage.
 */
const modalDialog = () => page.locator("[role=dialog][aria-modal=true]").last();
/** Card `id` in the hand or the China slot (data-hand-card): never a card reference in the log or a thumbnail. */
const handCard = id => page.locator(`[data-hand-card][data-card="${id}"]`).first();
/** Card `id` as a choice of the open dossier, if one is open and offers it. */
async function dossierCard(id) {
  const dlg = modalDialog();
  if (!(await dlg.count())) return null;
  const c = dlg.locator(`button[aria-pressed]:not([aria-disabled])`).filter({ has: page.locator(`[data-card="${id}"]`) }).first();
  return (await c.count()) ? c : null;
}

/** The element that answers option `o` of prompt `p` (null: use the keyboard path). */
async function target(p, o) {
  if (o.kind === "card") {
    // Hand cards and the China slot (data-hand-card); CardFace thumbnails and the log's card references also carry
    // data-card.
    const inHand = handCard(o.id);
    if (await inHand.count() && await visiblePoint(inHand)) return inHand;
    // Compact with the drawer closed (it stays mounted): open the hand from the dock, as a player would.
    const dockHand = page.locator("nav button[aria-expanded]").first();
    if (["headline", "action-card", "event-card"].includes(p.kind) && await dockHand.isVisible().catch(() => false)) {
      // A dock still sliding in (or covered for a moment) must not end the run: the answer falls back below.
      await press(dockHand).catch(e => log("dock press failed", String(e).slice(0, 120)));
      await page.waitForTimeout(500);
    }
    return (await inHand.count()) ? inHand : null;
  }
  if (o.kind === "mode" || o.kind === "op-mode") return page.locator(`[data-mode="${MODE_KEY[o.kind][o.id]}"]`).first();
  if (o.kind === "un-intervention") return page.getByRole("button", { name: /UN Intervention|联合国干预/ }).first();
  if (o.kind === "region") {
    // Compact layouts answer a region prompt with the theatre chip (the plates are on the map, often off camera);
    // elsewhere with the region's plate.
    const chip = page.locator(`button[data-slot="${o.id}"]`).first();
    if (await chip.isVisible().catch(() => false)) return chip;
    const btn = page.locator(`[data-plate="${o.id}"]`).first();
    if (await btn.count()) return btn;
  }
  return null;
}

/** Keys go to the keymap, not to a button that kept focus (Enter on a focused button is that button's). */
const blur = () => page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());

async function changed(id, ms = 1500) {
  try {
    await page.waitForFunction(pid => { const p = window.__tsp.getSnapshot().prompt; return !p || p.promptId !== pid; }, id, { timeout: ms });
    return true;
  } catch { return false; }
}

/** Activate a dossier tile / picker card for option `o` and confirm (or hold, for a hold choice). */
async function answerDialog(p, o) {
  const dlg = modalDialog();
  if (!(await dlg.count())) return false;
  if (o.kind === "done") {
    await page.keyboard.press("d");
    via.key++;
  } else if (p.kind === "defcon-level") {
    // The lamp whose numeral is the level.
    const lamp = dlg.locator("button[aria-pressed]").filter({ has: page.locator("span", { hasText: new RegExp(`^${o.id}$`) }) }).first();
    await press(lamp);
  } else if (p.kind === "branch") {
    const tiles = dlg.locator("button[aria-pressed]");
    const branches = p.options.filter(x => x.kind === "branch");
    await press(tiles.nth(Math.max(0, branches.findIndex(x => x.idx === o.idx))));
  } else {
    const cards = dlg.locator("button[aria-pressed]:not([aria-disabled])");
    const exact = cards.filter({ has: page.locator(`[data-card="${o.id}"]`) }).first();
    if (o.kind === "card" && await exact.count()) await press(exact);
    else {
      if (POLICY === "ai") return false;
      const n = await cards.count();
      if (!n) return false;
      await press(cards.nth(Math.floor(rnd() * n)));
    }
  }
  via.dialog++;
  if (await changed(p.id, 700)) return true;
  const primary = keyButton(dlg, "↵", "Enter").last();
  if (await primary.count()) await press(primary).catch(() => {});
  else { await page.keyboard.press("Enter"); via.key++; }
  if (await changed(p.id, 2500)) return true;
  return holdIfOffered(p);
}

/**
 * A button by its shortcut: its key cap (`<kbd>`), or, on touch screens where the cap is not drawn (QA R-011), its
 * `aria-keyshortcuts` (the Button derives it from the cap).
 */
function keyButton(scope, cap, key) {
  return scope.locator("button", { has: page.locator("kbd", { hasText: cap }) }).or(scope.locator(`button[aria-keyshortcuts~="${key}"]`));
}

/** boxPoint once the map stands still (the camera animates when it follows the play, or zooms in on a tap). */
async function stableBoxPoint(id) {
  let a = await boxPoint(id);
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(120);
    const b = await boxPoint(id);
    if (a && b && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1) return b;
    a = b;
  }
  return a;
}

/** Answer a country option: the box at an uncovered point (framing the world first if needed), else the keyboard. */
async function answerCountry(p, o) {
  let at = await stableBoxPoint(o.id);
  if (!at) {
    const world = page.getByRole("button", { name: /World|全图/ }).first();
    if (await world.isVisible().catch(() => false)) { await press(world).catch(() => {}); await page.waitForTimeout(600); }
    at = await stableBoxPoint(o.id);
  }
  // Each press at a fresh point: a staged box commits on the second press; on a phone's small-scale map a tap that
  // covers two targets zooms in first (tap safety), which moves every box.
  for (let attempt = 0; at && attempt < 4; attempt++) {
    await pressAt(at.x, at.y);
    if (await changed(p.id, attempt ? 900 : 600)) return true;
    at = await stableBoxPoint(o.id);
  }
  if (at) {
    await blur(); await page.keyboard.press("Enter"); via.key++;
    if (await changed(p.id, 2500)) return true;
    if (await holdIfOffered(p)) return true;
  }
  // Out of reach for the pointer (covered, off screen): focus the box and press Enter, as a keyboard player would.
  const box = page.locator(`svg[role=application] [data-cid="${o.id}"]`).first();
  if (await box.count()) {
    await box.focus().catch(() => {});
    await page.keyboard.press("Enter"); via.key++;
    if (await changed(p.id, 900)) return true;
    await page.keyboard.press("Enter"); via.key++;
    if (await changed(p.id, 2500)) return true;
    if (await holdIfOffered(p)) return true;
  }
  return false;
}

async function answer(v) {
  const p = v.prompt;
  let o = POLICY === "ai" ? await chooseAi(v) : chooseRandom(v);
  if (!o) return null;
  if (o.kind === "country" && POLICY === "random") {
    // Random play only clicks what is on screen: frame the world first when the camera shows none of the targets.
    let vis = new Map((await visibleCountries()).map(c => [c.id, c]));
    let pool = safe(p.options).filter(x => x.kind === "country" && vis.has(x.id));
    if (!pool.length) {
      const world = page.getByRole("button", { name: /World|全图/ }).first();
      if (await world.count()) { await press(world).catch(() => {}); await page.waitForTimeout(600); }
      vis = new Map((await visibleCountries()).map(c => [c.id, c]));
      pool = safe(p.options).filter(x => x.kind === "country" && vis.has(x.id));
    }
    if (pool.length && !vis.has(o.id)) o = pick(pool);
  }
  const tag = `${p.kind}#${p.id} → ${o.kind}:${o.id}`;
  let ok = false;
  if (o.kind === "country") {
    ok = await answerCountry(p, o);
  } else if (["branch", "defcon-level"].includes(p.kind)
             || (p.kind === "event-card" && o.kind !== "done" && (await dossierCard(o.id) || !(await handCard(o.id).count())))) {
    ok = await answerDialog(p, o);
  } else if (o.kind === "done") {
    // The done button (key cap D) of the dossier on screen, else the slip's: the first press stages it, the second
    // (or the primary, key cap ↵) commits.
    for (const scope of [modalDialog(), page.locator("[data-mode=prompt]").first()]) {
      if (ok || !(await scope.count())) continue;
      const btn = keyButton(scope, /^D$/, "D").first();
      if (!(await btn.count())) continue;
      await press(btn).catch(() => {});
      ok = await changed(p.id, 700);
      if (!ok) {
        const primary = keyButton(scope, "↵", "Enter").first();
        await press(await primary.count() ? primary : btn).catch(() => {});
        ok = await changed(p.id, 2500);
      }
    }
    if (!ok) {
      await blur();
      await page.keyboard.press("d"); via.key++;
      ok = await changed(p.id, 700);
      if (!ok) { await page.keyboard.press("Enter"); via.key++; ok = await changed(p.id, 2500); }
    }
  } else {
    const el = await target(p, o);
    if (el) {
      await press(el).catch(e => log("press failed", tag, String(e).slice(0, 120)));
      ok = await changed(p.id, 600);
      if (!ok && o.kind === "card") {
        // Compact: the tap opened the card sheet; its answer button plays the card.
        const sheetBtn = page.locator("[role=dialog] button", { hasText: /Play|Commit|Headline|Discard|Give|Score|打出|确定|头条|弃掉|给出|计分|⟦/ }).last();
        if (await sheetBtn.isVisible().catch(() => false)) {
          await press(sheetBtn).catch(() => {});
          ok = await changed(p.id, 1200);
        }
      }
      if (!ok) {
        // Staged: the second activation on the same thing commits (or Enter).
        await press(el).catch(() => {});
        ok = await changed(p.id, 900);
      }
      if (!ok) { await blur(); await page.keyboard.press("Enter"); via.key++; ok = await changed(p.id, 2500); }
      if (!ok) ok = await holdIfOffered(p);
    } else if (p.kind === "region") {
      await press(page.getByRole("group").locator("button[aria-pressed]").first()).catch(() => {});
      ok = await changed(p.id, 600);
      if (!ok) { await page.keyboard.press("Enter"); via.key++; ok = await changed(p.id, 2500); }
    }
  }
  if (!ok) {
    // The prompt may have been answered after all (a late frame); only a still-open prompt is a fallback.
    const still = await page.evaluate(pid => window.__tsp.getSnapshot().prompt?.promptId === pid, p.id);
    if (still) {
      fallbacks.push(tag);
      log("FALLBACK (UI did not answer)", tag);
      await shot(`fail-${fallbacks.length}`);
      await page.evaluate(([pid, idx]) => window.__tsp.choose(pid, idx), [p.id, o.idx]);
      await changed(p.id, 3000);
    }
  }
  const chose = await page.evaluate(pid => window.__tspChosen?.[pid], p.id);
  if (chose !== undefined && chose !== o.idx) {
    const got = p.options.find(x => x.idx === chose);
    mismatches.push(`${tag} but the UI chose ${got ? `${got.kind}:${got.id}` : chose}`);
    log("MISMATCH", mismatches[mismatches.length - 1]);
    await shot(`mismatch-${mismatches.length}`);
  }
  track(p, o);
  return tag;
}

/** What an answer exercised. */
function track(p, o) {
  if (p.kind === "headline") done.add("headline");
  if (p.kind === "coup-target") done.add("coup");
  if (p.kind === "realign-target" && o.kind === "country") done.add("realign");
  if (p.kind === "event-target") done.add("eventTarget");
  if (p.kind === "event-card") done.add("eventCard");
  if (p.kind === "branch" || p.kind === "defcon-level" || p.kind === "region") done.add(p.kind);
  if (p.kind === "play-mode" && o.kind === "mode" && o.id === 0) done.add("eventMode");
  if (p.kind === "play-mode" && o.kind === "mode" && o.id === 1) done.add("space");
  if ((p.kind === "action-card" || p.kind === "headline") && SCORING.has(o.id)) done.add("scoring");
}

async function continueIfWaiting() {
  const btn = page.getByRole("button", { name: /^(Continue|继续|⟦Continue⟧)/ });
  const n = await btn.count();
  for (let i = 0; i < n; i++) {
    const b = btn.nth(i);
    if (await b.isVisible().catch(() => false)) {
      await (TOUCH ? b.tap() : b.click()).catch(() => {});
      return true;
    }
  }
  return false;
}

/** The language toggle: in the console (desktop/tablet), or inside the ☰ menu sheet (compact). */
async function switchLang(name) {
  const direct = page.getByRole("button", { name }).first();
  if (await direct.isVisible().catch(() => false)) { await press(direct); return; }
  // A sheet (the auto-opened hand drawer) is over the console: close it first, as a player would.
  for (let i = 0; i < 3; i++) {
    const open = await page.evaluate(() => [...document.querySelectorAll("[role=dialog]")].map(d => d.getAttribute("aria-label")));
    if (!open.length) break;
    log("closing", open.join(", "));
    await blur();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(450);
  }
  await press(page.getByRole("button", { name: /^(Menu|菜单)$/ }).first()).catch(async e => { await shot("menu-fail"); throw e; });
  await press(page.getByRole("button", { name }).first());
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
}

// ── Start ──
const sideName = { US: /United States|美国|⟦United States⟧/, USSR: /Soviet Union|苏联|⟦Soviet Union⟧/, random: /Toss a coin|掷硬币|⟦Toss a coin⟧/ }[SIDE];
await press(page.getByRole("button", { name: sideName }).first());
await page.waitForFunction(() => window.__tsp.getSnapshot().status === "playing", null, { timeout: 20000 });
log(`game started ${SIDE} → human ${(await vm()).human}; policy ${POLICY}${POLICY === "ai" ? ` (${AUTO})` : ""}, ${W}×${H} ${LANG}${TOUCH ? " touch" : ""}${GAME_SEED ? `, game seed ${GAME_SEED}` : ""}; ${BROWSER} ${browser.version()}`);

let steps = 0, last = "", langSwitched = 0, reloaded = false, undone = false, lastTurnLogged = 0;
const t0 = Date.now();
let progressKey = "", progressAt = Date.now(), stalls = 0;
let final = null;
while (steps < MAX_STEPS) {
  const v = await vm();
  final = v;
  // Stall watchdog: nothing moved (frame, prompt, AI) for 25 s → dump what is on screen and stop.
  const key = `${v.seq}|${v.prompt?.id ?? "-"}|${v.ai}|${v.status}`;
  if (key !== progressKey) { progressKey = key; progressAt = Date.now(); }
  else if (Date.now() - progressAt > 25000) {
    stalls++;
    log("STALL", key, JSON.stringify(v.prompt ?? null).slice(0, 300));
    log("dialogs:", await page.evaluate(() => [...document.querySelectorAll("[role=dialog]")].map(d => (d.getAttribute("aria-label") ?? "") + ": " + (d.textContent ?? "").slice(0, 120)).join(" || ")));
    await shot(`stall-${stalls}`);
    errors.push(`stall at ${key}`);
    break;
  }
  if (v.status === "over") { log("game over", JSON.stringify(v.ending)); break; }
  if (v.status === "error") { errors.push("status error"); break; }
  if (v.turn > lastTurnLogged) { lastTurnLogged = v.turn; log(`turn ${v.turn} (VP ${v.vp}, DEFCON ${v.defcon}; ${steps} answers)`); }
  if (v.turn >= UNTIL) { log(`reached turn ${v.turn}`); break; }
  if (await continueIfWaiting()) { done.add("continue"); await page.waitForTimeout(200); continue; }
  if (!v.prompt) { await page.waitForTimeout(120); continue; }
  // Optional QA moves.
  if (flag("switch-lang") && langSwitched === 0 && v.turn === 1 && v.ar >= 2) {
    await switchLang(/^(简体中文|中文)$/);
    await page.waitForFunction(() => document.documentElement.lang.startsWith("zh"));
    langSwitched = 1; log("language → zh"); await shot("lang-zh"); continue;
  }
  if (flag("switch-lang") && langSwitched === 1 && v.turn === 1 && v.ar >= 4) {
    await switchLang(/^(English|EN)$/);
    await page.waitForFunction(() => !document.documentElement.lang.startsWith("zh"));
    langSwitched = 2; log("language → en"); continue;
  }
  if (flag("undo") && !undone && v.canUndo && v.prompt.kind === "influence" && v.prompt.remaining < v.prompt.opsValue) {
    const before = v.prompt.id;
    await page.keyboard.press("z");
    await changed(before, 3000);
    const after = await vm();
    log("undo:", v.prompt.kind, "→", after.prompt?.kind);
    undone = true; done.add("undo"); continue;
  }
  if (flag("reload") && !reloaded && v.turn === 2 && v.ar >= 1 && v.phase === "ACTION_ROUND") {
    log("reload…");
    reloading = true;
    await page.reload({ waitUntil: "load" });
    reloading = false;
    await page.waitForFunction(() => window.__tsp && window.__tsp.getSnapshot().status === "menu", null, { timeout: 30000 });
    await spyOnChoose();
    await autopilotReady();
    await shot("resume-start");
    await press(page.getByRole("button", { name: /Resume game|继续对局|⟦Resume game⟧/ }).first());
    await page.waitForFunction(() => window.__tsp.getSnapshot().status === "playing", null, { timeout: 20000 });
    reloaded = true; done.add("reload"); log("resumed"); continue;
  }
  const tag = await answer(v);
  if (tag === null) continue; // the prompt changed while the autopilot thought
  if (tag !== last) steps++;
  last = tag;
  if (steps % 50 === 0) log(`${steps} answers`, tag);
}
/** The game-over telex (GameOverTelex: a dialog named `ui:over.gameOver`). */
const telexDialog = () => page.getByRole("dialog", { name: /^(Game over|游戏结束|⟦Game over⟧)$/ });

/**
 * Wait for the game-over telex to be up and settled, as a player would see it: the last frames played (Continue
 * pressed where the UI waits), the game-over beat over -- for a final-scoring ending that beat first fills the final
 * scoring sheet, row by row (stageStore.onGameOver) -- then the telex risen, stamped and its chart drawn: no finite
 * animation running in it or its scrim, its text (the typewriter "Flash") and position unchanged for two samples.
 * False when no telex came within `ms`.
 */
async function telexSettled(ms = 90000) {
  const dlg = telexDialog();
  const t = Date.now();
  while (!(await dlg.isVisible().catch(() => false))) {
    if (Date.now() - t > ms) return false;
    if (await continueIfWaiting()) done.add("continue");
    await page.waitForTimeout(400);
  }
  let prev = "";
  for (let i = 0; i < 60; i++) {
    const cur = await dlg.evaluate(el => {
      const running = document.getAnimations().filter(a => {
        const target = a.effect && "target" in a.effect ? a.effect.target : null;
        return a.playState === "running" && target instanceof Node && (el.contains(target) || target.contains(el))
          && a.effect.getComputedTiming().iterations !== Infinity;
      }).length;
      const r = el.getBoundingClientRect();
      return `${running}|${Math.round(r.top)}|${el.textContent}`;
    }).catch(() => "");
    if (cur.startsWith("0|") && cur === prev) return true;
    prev = cur;
    await page.waitForTimeout(300);
  }
  return true;
}

if (final?.status === "over" || (await vm()).status === "over") {
  if (!(await telexSettled())) { log("no game-over telex came"); errors.push("no game-over telex"); }
  else log("telex up");
  await shot("game-over");
}

if (flag("resign")) {
  const v = await vm();
  if (v.status === "playing") {
    await press(page.getByRole("button", { name: /^(Menu|菜单)$/ }).first());
    await press(page.getByRole("menuitem", { name: /Resign|认输/ }));
    const hold = page.getByRole("button", { name: /Resign|认输/ }).last();
    const box = await hold.boundingBox();
    await holdAt(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForFunction(() => window.__tsp.getSnapshot().status === "over", null, { timeout: 10000 });
    if (!(await telexSettled(20000))) { log("no telex after resigning"); errors.push("no resign telex"); }
    await shot("resign-telex");
    done.add("resign");
    log("resigned");
  }
}

const end = await vm();
const auto = POLICY === "ai" ? await page.evaluate(() => window.__tspAuto.stats()).catch(() => null) : null;
const wall = Math.round((Date.now() - t0) / 1000);
const result = {
  browser: `${BROWSER} ${browser.version()}`,
  side: SIDE, human: end.human, policy: POLICY, auto: POLICY === "ai" ? AUTO : null, viewport: `${W}x${H}`, lang: LANG, touch: TOUCH,
  gameSeed: GAME_SEED || null, status: end.status, turn: end.turn, vp: end.vp, defcon: end.defcon, ending: end.ending,
  answers: steps, via, fallbacks: fallbacks.length, mismatches: mismatches.length, autopilotFallbacks: autoFallbacks.length,
  errors: errors.length, wallSeconds: wall,
  autopilot: auto && { suggestions: auto.suggestions, ai: auto.ai, unmapped: auto.unmapped, errors: auto.errors, stale: auto.stale, ms: Math.round(auto.ms) },
  exercised: [...done].sort(),
};
log(`done in ${wall} s, ${steps} answers (${Object.entries(via).map(([k, n]) => `${k} ${n}`).join(", ")}); exercised: ${[...done].sort().join(", ")}`);
log(`result: ${end.ending ? `${end.ending.reason}, ${end.ending.winner} wins, turn ${end.ending.turn}, VP ${end.ending.vpFinal}` : `stopped in turn ${end.turn} (${end.status})`}`);
if (auto) log(`autopilot: ${auto.suggestions} suggestions, ${auto.ai} the AI's own, ${auto.unmapped} not an option (fallback), ${auto.errors} errors, ${auto.stale} stale`);
for (const f of autoFallbacks) log("  autopilot fallback:", f);
log(`fallbacks: ${fallbacks.length}`, fallbacks.join(" | "));
log(`mismatches (the UI chose another option than the one pressed for): ${mismatches.length}`, mismatches.join(" | "));
log(`errors: ${errors.length}`);
for (const e of errors) console.log("  ", e);
console.log(`RESULT ${JSON.stringify(result)}`);
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(result, null, 1));
await browser.close();
process.exit(fallbacks.length || mismatches.length || errors.length ? 1 : 0);
