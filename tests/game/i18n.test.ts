/**
 * The `prompt` catalogs (owned by src/game) and every Message the controller emits: each key exists
 * in English and Chinese, both catalogs have the same keys and placeholders, and every message of a
 * played game renders fully in both languages.
 */
import { afterAll, describe, expect, it } from "vitest";
import i18next from "i18next";
import en from "../../src/i18n/locales/en/prompt.json";
import zh from "../../src/i18n/locales/zh-CN/prompt.json";
import { Message, MessageArg, render, setLanguage } from "../../src/i18n";
import type { EndingReason, Prompt, Warning } from "../../src/game/contract";
import { doneLabel, endingMessage, warningMessage } from "../../src/game/messages";
import { drive, makeController, mulberry32 } from "./helpers";

type Tree = { [k: string]: string | Tree };

function leaves(t: Tree, pre = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(t)) {
    if (typeof v === "string") out.set(pre + k, v);
    else for (const [kk, vv] of leaves(v, `${pre}${k}.`)) out.set(kk, vv);
  }
  return out;
}

const placeholders = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort();

function isMessage(a: MessageArg): a is Message {
  return typeof a === "object" && a !== null && "key" in a;
}

/** Every key of a message and its nested messages, with the count it is rendered with. */
function keysOf(m: Message): Array<{ key: string; count?: number }> {
  const count = typeof m.params?.count === "number" ? m.params.count : undefined;
  const out: Array<{ key: string; count?: number }> = [count === undefined ? { key: m.key } : { key: m.key, count }];
  for (const a of Object.values(m.params ?? {})) if (isMessage(a)) out.push(...keysOf(a));
  return out;
}

describe("prompt catalogs", () => {
  it("have the same keys and placeholders in English and Chinese", () => {
    // Plurals: English has _one and _other, Chinese only _other.
    const fold = (m: Map<string, string>) => {
      const out = new Map<string, string>();
      for (const [k, v] of m) {
        const base = k.replace(/_(one|other)$/, "");
        if (!k.endsWith("_one") || !out.has(base)) out.set(base, v);
        if (k.endsWith("_other")) out.set(base, v);
      }
      return out;
    };
    const a = fold(leaves(en as Tree));
    const b = fold(leaves(zh as Tree));
    expect([...b.keys()].sort()).toEqual([...a.keys()].sort());
    for (const [k, v] of a) expect(placeholders(b.get(k)!), k).toEqual(placeholders(v));
    for (const k of leaves(zh as Tree).keys()) expect(k.endsWith("_one"), k).toBe(false);
  });

  it("word every event decision of docs/notes/ui-flow.md section 3 specifically", () => {
    const card = (en as unknown as { card: Record<string, Record<string, string>> }).card;
    const has = (id: number, k: string) => !!(card[String(id)]?.[k] ?? card[String(id)]?.[`${k}_other`]);
    for (const id of [7, 14, 19, 22, 23, 24, 28, 29, 30, 36, 40, 47, 53, 56, 63, 66, 70, 74, 75, 76, 87, 88, 91, 95, 99, 102, 104, 105, 106, 107]) {
      expect(has(id, "target"), `target ${id}`).toBe(true);
    }
    for (const id of [16, 33]) expect(has(id, "targetAdd") && has(id, "targetRemove"), `target ${id}`).toBe(true);
    for (const id of [10, 32, 43, 49, 77, 85, 95, 98, 108]) expect(has(id, "card"), `card ${id}`).toBe(true);
    for (const id of [20, 26, 47, 57, 62, 67, 89, 90, 96]) expect(has(id, "opMode"), `opMode ${id}`).toBe(true);
    for (const id of [16, 20, 100]) expect(has(id, "branch"), `branch ${id}`).toBe(true);
    for (const id of [45, 46]) expect(has(id, "defcon"), `defcon ${id}`).toBe(true);
    expect(has(94, "region") && has(67, "playMode") && has(250, "cardUS") && has(250, "cardUSSR")).toBe(true);
  });

  it("use the project's Chinese terms", () => {
    const text = [...leaves(zh as Tree).values()].join("\n");
    expect(text).toContain("DEFCON");
    expect(text).not.toContain("核危机等级");
    expect(text).not.toContain("调整阵营");
    for (const term of ["政变", "调整", "影响力", "战场国", "太空竞赛", "头条"]) expect(text).toContain(term);
  });
});

describe("messages of played games", () => {
  afterAll(async () => { await setLanguage("en"); });

  it("all exist and render in both languages", async () => {
    const messages: Message[] = [];
    for (const side of ["USSR", "US"] as const) {
      const h = makeController({ aiSalt: side === "US" ? 3 : 4 });
      await h.ctrl.boot();
      await h.ctrl.newGame({ side, seed: side === "US" ? 4242 : 4343 });
      const prompts: Prompt[] = [];
      await drive(h, { rand: mulberry32(side === "US" ? 9 : 10), avoidWarned: 0.97, onPrompt: p => prompts.push(p) });
      for (const p of prompts) {
        messages.push(p.title);
        if (p.detail) messages.push(p.detail);
        const done = doneLabel(p);
        if (done) messages.push(done);
        for (const o of p.options) for (const w of o.warnings ?? []) messages.push(warningMessage(w));
      }
      for (const e of h.ctrl.getSnapshot().log) messages.push(e.text, ...(e.details ?? []));
    }
    expect(messages.length).toBeGreaterThan(200);
    // Every warning form and every ending, whether or not these games produced them.
    const warnings: Warning[] = [
      { code: "scoring-stranded", params: { scoring: 2, plays: 1 } }, { code: "defcon-suicide", params: { faces: 6 } },
      { code: "defcon-suicide", params: { faces: 2 } }, { code: "cmc-suicide", params: { faces: 6 } },
      { code: "game-ending", params: { winner: "US", reason: "vp20", faces: 6 } }, { code: "game-ending", params: { winner: "USSR", reason: "vp20", faces: 3 } },
      { code: "game-ending", params: { winner: "DRAW", reason: "wargames", faces: 6 } }, { code: "opponent-event", params: { card: 26, side: "US" } },
    ];
    messages.push(...warnings.map(warningMessage));
    // Every done label (ui-spec 8.4), whether or not these games offered it.
    const base = { promptId: 1, decisionType: 1, resolvingCard: 0, pendingCard: 0, opsValue: 0, remaining: 0, maxPerCountry: 0,
      options: [], cards: [], countries: [], title: { key: "prompt:title.headline" }, done: { idx: 208, kind: "done", id: 0 } } as unknown as Prompt;
    const contexts: Partial<Prompt>[] = [
      { kind: "action-card", doneMeaning: "pass", title: { key: "prompt:title.actionCardAr8" } }, { kind: "action-card", doneMeaning: "pass", cards: [6] },
      { kind: "action-card", doneMeaning: "pass" }, { kind: "event-card", doneMeaning: "pass", resolvingCard: 250 },
      { kind: "realign-target", doneMeaning: "stop" }, { kind: "influence", doneMeaning: "stop" },
      { kind: "event-target", doneMeaning: "decline", resolvingCard: 40 }, { kind: "event-card", doneMeaning: "decline", resolvingCard: 10 },
      { kind: "event-card", doneMeaning: "decline", resolvingCard: 95 }, { kind: "op-mode", doneMeaning: "decline", pendingCard: 47 },
      { kind: "op-mode", doneMeaning: "decline", pendingCard: 26 }, { kind: "play-mode", doneMeaning: "return", resolvingCard: 67 },
      { kind: "event-card", doneMeaning: "return", resolvingCard: 108 }, { kind: "event-card", doneMeaning: "skip", resolvingCard: 43 },
      { kind: "event-target", doneMeaning: "skip", resolvingCard: 91 },
    ];
    const labels = contexts.map(c => doneLabel({ ...base, ...c } as Prompt)!);
    const overrides = Object.keys((en as unknown as { doneFor: Record<string, string> }).doneFor).map(k => `prompt:doneFor.${k}`);
    expect(new Set(labels.map(l => l.key))).toEqual(new Set([...overrides, "prompt:done.pass", "prompt:done.stop", "prompt:done.decline", "prompt:done.skip"]));
    messages.push(...labels);
    const reasons: EndingReason[] = ["vp20", "europe-control", "defcon", "cmc-suicide", "held-scoring", "held-scoring-both", "milops-vp20", "final-scoring", "wargames", "resign"];
    for (const reason of reasons) messages.push(endingMessage({ winner: "US", reason, vpBefore: 0, vpFinal: 20, turn: 7 }));
    for (const lng of ["en", "zh-CN"] as const) {
      await setLanguage(lng);
      for (const m of messages) {
        for (const { key, count } of keysOf(m)) {
          // The language's own catalog, not the English fallback.
          const [ns, path] = key.split(":");
          const own = i18next.getResource(lng, ns, path) ?? (count !== undefined ? i18next.getResource(lng, ns, `${path}_other`) : undefined);
          expect(typeof own, `${lng}: ${key}`).toBe("string");
        }
        const text = render(m);
        expect(text, `${lng}: ${m.key}`).not.toMatch(/\{\{|\}\}/);
        expect(text.length, `${lng}: ${m.key}`).toBeGreaterThan(0);
      }
    }
  });
});
