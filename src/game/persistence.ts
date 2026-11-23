/**
 * The autosave (docs/ARCHITECTURE.md "Persistence", critique.md section 3.7): the seed and every
 * step as its MicroAction, never an engine save or snapshot (an engine save carries a uint64 RNG
 * state that JSON numbers would round, and raw snapshots are only valid for one build). Resume =
 * newGame(seed) -> seat both sides -> replay the steps.
 *
 * Format v2 (QA round 2, OD-1): the stored value is `"TSP2:" + base64url(payload XOR keystream)`, where payload =
 * CRC-32 of the UTF-8 JSON (4 bytes, big-endian) + the UTF-8 JSON itself, and the keystream comes from a fixed key in
 * this file. That stops reading the AI's face-down headline (the last step) in the browser's storage view without code,
 * and edited or truncated saves fail the checksum. It is obfuscation, not security: the key ships with the page, so
 * anyone with developer tools can decode, edit and re-encode a save (the About dialog says so). A plain-JSON v1 save
 * (`{"v":1,...}`, written before this format) is still read, and rewritten as v2 at boot (and on resume).
 */
import type { MicroAction } from "../engine/types";
import type { Ending, Side } from "./contract";

/** The storage key. It keeps its v1 name (one key across formats: the two-tab logic watches one key). */
export const SAVE_KEY = "ts-playfield.game.v1";
/** The save format written now (`SavedGame.v`): v2, the encoded one. */
export const SAVE_VERSION = 2;
/** The plain-JSON format written before v2 (read and migrated, never written). */
export const LEGACY_SAVE_VERSION = 1;
/** Every v2 value starts with this. */
export const SAVE_PREFIX = "TSP2:";

/** The part of the Web Storage API the controller uses (localStorage in the page). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /**
   * Optional: call `onChange` when the save may have changed under this page -- another tab wrote or removed it
   * (the `storage` event), or this page comes back from the back/forward cache or into view (it may have missed
   * those events). Returns the unsubscribe function. The controller then checks whether its game is still the live
   * copy (one live copy per save: QA Q-002).
   */
  subscribe?(onChange: () => void): () => void;
}

export type SavedStep = [number, number, number, number];

export interface SavedGame {
  /** The format (always SAVE_VERSION in what readSave returns: a v1 save read is upgraded). */
  v: typeof SAVE_VERSION;
  /** Engine build the steps were played on (WasmEngine.fingerprint); replay needs the same. */
  fingerprint: string;
  modelSha256: string | null;
  search: string | null;
  seed: number;
  humanSide: Side;
  /** Every applied step, in order: [decision_type, primary_id, secondary_id, flags]. */
  steps: SavedStep[];
  /** One character per step: "1" when it was auto-played (forced), "0" otherwise. */
  autoFlags: string;
  /** The game is finished (nothing to resume). */
  over?: boolean;
  ending?: Ending | null;
  /** Wall-clock time of the write (Date.now()). */
  savedAt: number;
  /** Where the game stands, for the start screen (ViewModel.savedGame): the turn, and the action
   *  round (0 in the setup and headline phases). Absent in saves written before they existed. */
  turn?: number;
  ar?: number;
  /** The AI's decisions and thinking time so far (ViewModel.aiStats), kept across resumes. */
  aiStats?: { decisions: number; ms: number };
  /** The page (controller instance) that wrote this save: a tab whose game is not the writer's no longer moves. */
  writer?: string;
}

/** The start screen's summary of a save (ViewModel.savedGame), or null when it lacks the fields. */
export function saveSummary(save: SavedGame | null): { turn: number; ar: number; humanSide: Side; savedAt: number } | null {
  if (!save || typeof save.turn !== "number" || typeof save.ar !== "number") return null;
  return { turn: save.turn, ar: save.ar, humanSide: save.humanSide, savedAt: save.savedAt };
}

export function toSavedStep(a: Required<MicroAction>): SavedStep {
  return [a.decision_type, a.primary_id, a.secondary_id, a.flags];
}

export function fromSavedStep(s: SavedStep): Required<MicroAction> {
  return { decision_type: s[0], primary_id: s[1], secondary_id: s[2], flags: s[3] };
}

/**
 * What storage holds under SAVE_KEY:
 * - `none`: nothing (or storage is unreadable);
 * - `ok`: a save this code can use (`legacy`: a plain-JSON v1 save, to be rewritten as v2);
 * - `unreadable`: something that is not a save this code wrote -- tampered with or corrupted (the checksum fails),
 *   truncated, not valid JSON, missing fields, or a format this code does not know.
 */
export type SaveRead =
  | { kind: "none" }
  | { kind: "ok"; save: SavedGame; legacy: boolean }
  | { kind: "unreadable" };

/** Decode a stored value (`text` from storage); see SaveRead. */
export function decodeSave(text: string | null | undefined): SaveRead {
  if (!text) return { kind: "none" };
  if (text.startsWith(SAVE_PREFIX)) {
    const json = unseal(text.slice(SAVE_PREFIX.length));
    const save = json === null ? null : parseSave(json, SAVE_VERSION);
    return save ? { kind: "ok", save, legacy: false } : { kind: "unreadable" };
  }
  // Format v1: plain JSON (no checksum: accepted as it is, then rewritten).
  const save = text.trimStart().startsWith("{") ? parseSave(text, LEGACY_SAVE_VERSION) : null;
  return save ? { kind: "ok", save, legacy: true } : { kind: "unreadable" };
}

/** The stored value for a save (format v2). */
export function encodeSave(save: SavedGame): string {
  return SAVE_PREFIX + seal(JSON.stringify({ ...save, v: SAVE_VERSION }));
}

/** What storage holds (see SaveRead); `none` when storage is missing or refuses to read. */
export function inspectSave(storage: StorageLike | null | undefined): SaveRead {
  if (!storage) return { kind: "none" };
  let text: string | null;
  try {
    text = storage.getItem(SAVE_KEY);
  } catch {
    return { kind: "none" };
  }
  return decodeSave(text);
}

/** The saved game (v2, or v1 upgraded), or null when there is none or it is not one this code wrote. */
export function readSave(storage: StorageLike | null | undefined): SavedGame | null {
  const r = inspectSave(storage);
  return r.kind === "ok" ? r.save : null;
}

/** Write the save (format v2); false when the storage refused (quota, privacy mode). */
export function writeSave(storage: StorageLike | null | undefined, save: SavedGame): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SAVE_KEY, encodeSave(save));
    return true;
  } catch {
    return false;
  }
}

/**
 * Rewrite a plain-JSON v1 save as v2, the same game and fields (its `writer` too, so a tab playing it does not
 * stop). True when it did; false when storage holds no v1 save or refused the write.
 */
export function migrateSave(storage: StorageLike | null | undefined): boolean {
  const r = inspectSave(storage);
  return r.kind === "ok" && r.legacy && writeSave(storage, r.save);
}

function isSide(v: unknown): v is Side {
  return v === "US" || v === "USSR";
}

function isStep(v: unknown): v is SavedStep {
  return Array.isArray(v) && v.length === 4 && v.every(x => Number.isInteger(x) && x >= 0 && x < 65536);
}

/** The JSON of a save of format `version`, checked field by field; null when it is not one. */
function parseSave(text: string, version: number): SavedGame | null {
  try {
    const v = JSON.parse(text) as Partial<Omit<SavedGame, "v">> & { v?: unknown };
    if (!v || typeof v !== "object" || v.v !== version || typeof v.fingerprint !== "string" || !Number.isSafeInteger(v.seed)
        || !isSide(v.humanSide) || !Array.isArray(v.steps) || !v.steps.every(isStep) || typeof v.autoFlags !== "string"
        || v.autoFlags.length !== v.steps.length || !/^[01]*$/.test(v.autoFlags)) {
      return null;
    }
    const out: SavedGame = {
      v: SAVE_VERSION, fingerprint: v.fingerprint, modelSha256: v.modelSha256 ?? null, search: v.search ?? null,
      seed: v.seed as number, humanSide: v.humanSide, steps: v.steps, autoFlags: v.autoFlags, over: !!v.over,
      ending: v.ending ?? null, savedAt: typeof v.savedAt === "number" ? v.savedAt : 0,
    };
    const count = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0;
    if (count(v.turn) && count(v.ar)) { out.turn = v.turn; out.ar = v.ar; }
    const st = v.aiStats;
    if (st && count(st.decisions) && typeof st.ms === "number" && Number.isFinite(st.ms) && st.ms >= 0) {
      out.aiStats = { decisions: st.decisions, ms: st.ms };
    }
    if (typeof v.writer === "string" && v.writer.length <= 64) out.writer = v.writer;
    return out;
  } catch {
    return null;
  }
}

// ── v2 envelope: CRC-32 + XOR keystream + base64url ──────────────────────────────────────────

/**
 * The fixed obfuscation key. Not a secret (it ships with the page): it only keeps the save from being readable or
 * editable without code. Changing it makes every v2 save unreadable.
 */
const OBFUSCATION_KEY = "Twilight Struggle Playfield / save v2 / not a secret";

/** FNV-1a (32-bit) of a string's UTF-16 code units: the keystream's seed. */
function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h >>> 0;
}

const KEY_SEED = fnv1a(OBFUSCATION_KEY);

/** XOR `bytes` in place with the keystream (mulberry32 from KEY_SEED, 4 bytes per draw). */
function xorKeystream(bytes: Uint8Array): void {
  let a = KEY_SEED;
  for (let i = 0; i < bytes.length; i += 4) {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const r = (t ^ (t >>> 14)) >>> 0;
    for (let k = 0; k < 4 && i + k < bytes.length; k++) bytes[i + k]! ^= (r >>> (8 * k)) & 0xff;
  }
}

let crcTable: Uint32Array | null = null;

/** CRC-32 (IEEE 802.3, as zip and PNG use). */
export function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
let b64Index: Int16Array | null = null;

function toBase64url(bytes: Uint8Array): string {
  const out: string[] = [];
  let chunk = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    chunk += B64[(n >>> 18) & 63]! + B64[(n >>> 12) & 63]!
      + (i + 1 < bytes.length ? B64[(n >>> 6) & 63]! : "") + (i + 2 < bytes.length ? B64[n & 63]! : "");
    if (chunk.length >= 4096) { out.push(chunk); chunk = ""; }
  }
  out.push(chunk);
  return out.join("");
}

/** Bytes of a base64url string without padding; null when it is not one (a stray character, an impossible length). */
function fromBase64url(text: string): Uint8Array | null {
  if (!b64Index) {
    b64Index = new Int16Array(128).fill(-1);
    for (let i = 0; i < B64.length; i++) b64Index[B64.charCodeAt(i)] = i;
  }
  if (text.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((text.length * 3) / 4));
  let o = 0, acc = 0, bits = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    const d = c < 128 ? b64Index[c]! : -1;
    if (d < 0) return null;
    acc = ((acc << 6) | d) & 0xffffff;
    bits += 6;
    if (bits >= 8) { bits -= 8; out[o++] = (acc >>> bits) & 0xff; }
  }
  // The leftover bits of the last character must be zero (one encoding per byte string).
  if (bits > 0 && (acc & ((1 << bits) - 1)) !== 0) return null;
  return o === out.length ? out : out.subarray(0, o);
}

/** The v2 body for a JSON text. */
function seal(json: string): string {
  const body = new TextEncoder().encode(json);
  const buf = new Uint8Array(4 + body.length);
  const crc = crc32(body);
  buf[0] = crc >>> 24; buf[1] = (crc >>> 16) & 0xff; buf[2] = (crc >>> 8) & 0xff; buf[3] = crc & 0xff;
  buf.set(body, 4);
  xorKeystream(buf);
  return toBase64url(buf);
}

/** The JSON text in a v2 body; null when it does not decode or its checksum fails. */
function unseal(text: string): string | null {
  const buf = fromBase64url(text);
  if (!buf || buf.length < 4) return null;
  xorKeystream(buf);
  const want = ((buf[0]! << 24) | (buf[1]! << 16) | (buf[2]! << 8) | buf[3]!) >>> 0;
  const body = buf.subarray(4);
  if (crc32(body) !== want) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return null;
  }
}

export function clearSave(storage: StorageLike | null | undefined): void {
  try {
    storage?.removeItem(SAVE_KEY);
  } catch {
    /* storage blocked */
  }
}

/**
 * A Map-backed StorageLike (tests, or a page whose storage is blocked). Instances made with the same `shared` map
 * behave like the tabs of one browser profile: a write or removal through one calls the other instances' `subscribe`
 * listeners (as the `storage` event does), never its own.
 */
export class MemoryStorage implements StorageLike {
  private readonly m: Map<string, string>;
  private readonly listeners = new Set<() => void>();
  private readonly peers: Set<MemoryStorage>;
  private static readonly hubs = new WeakMap<Map<string, string>, Set<MemoryStorage>>();

  constructor(shared?: Map<string, string>) {
    this.m = shared ?? new Map<string, string>();
    let peers = MemoryStorage.hubs.get(this.m);
    if (!peers) MemoryStorage.hubs.set(this.m, (peers = new Set()));
    peers.add(this);
    this.peers = peers;
  }

  /** The map behind this storage: pass it to another MemoryStorage for a second "tab". */
  get map(): Map<string, string> { return this.m; }
  getItem(key: string): string | null { return this.m.get(key) ?? null; }
  setItem(key: string, value: string): void { this.m.set(key, value); this.notify(); }
  removeItem(key: string): void { this.m.delete(key); this.notify(); }
  subscribe(onChange: () => void): () => void {
    this.listeners.add(onChange);
    return () => { this.listeners.delete(onChange); };
  }

  private notify(): void {
    for (const peer of this.peers) if (peer !== this) for (const l of [...peer.listeners]) l();
  }
}

/**
 * The page's localStorage, or null where it is unavailable (privacy mode, no DOM). Its `subscribe` listens for the
 * save key changing in another tab (`storage`), for the page coming back from the back/forward cache (`pageshow`
 * with `persisted`) and for the page coming into view (`visibilitychange`): a frozen or cached page may have missed
 * the storage events.
 */
export function browserStorage(): StorageLike | null {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    const probe = "ts-playfield.probe";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return {
      getItem: key => s.getItem(key),
      setItem: (key, value) => s.setItem(key, value),
      removeItem: key => s.removeItem(key),
      subscribe(onChange) {
        const w = globalThis as typeof globalThis & Partial<Pick<Window, "addEventListener" | "removeEventListener">>;
        if (typeof w.addEventListener !== "function" || typeof w.removeEventListener !== "function") return () => { /* no DOM */ };
        const onStorage = (e: StorageEvent) => { if (e.key === SAVE_KEY || e.key === null) onChange(); };
        const onShow = (e: PageTransitionEvent) => { if (e.persisted) onChange(); };
        const doc = (globalThis as { document?: Document }).document;
        const onVisible = () => { if (doc?.visibilityState === "visible") onChange(); };
        w.addEventListener("storage", onStorage);
        w.addEventListener("pageshow", onShow);
        doc?.addEventListener("visibilitychange", onVisible);
        return () => {
          w.removeEventListener!("storage", onStorage);
          w.removeEventListener!("pageshow", onShow);
          doc?.removeEventListener("visibilitychange", onVisible);
        };
      },
    };
  } catch {
    return null;
  }
}
