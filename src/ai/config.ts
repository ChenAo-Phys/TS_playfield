/**
 * The AI's fixed configuration: one network, one search, full strength (CLAUDE.md: "the single
 * highest-rated model and weights on the leaderboard"; docs/ARCHITECTURE.md "AI").
 *
 * Network  E8.1-A8-R132-S45@11160M+(S45,46,47)@11520..11600M ("B6 soup"), DeepStruggle (MIT), the
 *          network of leaderboard #1 and #2 (E8, both scales). Self-hosted in public/models/ (fetched by
 *          scripts/fetch-model.sh) with Hugging Face at a pinned commit as the fallback. Either way the
 *          bytes must hash to MODEL_SHA256 or they are refused.
 * Search   leaderboard #1: the rollout root with the policy-likelihood belief over the opponent's hand.
 */
import type { AiConfig } from "../game/contract";

/** What the network is called on the leaderboard and in its ONNX metadata (ts.label). */
export const MODEL_LABEL = "E8.1-A8-R132-S45@11160M+(S45,46,47)@11520..11600M";
/** The served file name in public/models/ (URL-safe; scripts/fetch-model.sh writes it). */
export const MODEL_FILE = "ds-e8.1-b6soup-70b117b5.onnx";
export const MODEL_SHA256 = "70b117b5290c3d7671cbb3645719e1b3cbd91ced173eac747b7967f1330ff09e";
/** Exact size of the file, used for download progress when the server sends no Content-Length. */
export const MODEL_BYTES = 5_797_418;

export const MODEL_HF_REPO = "mihaild/deepstruggle";
/** A commit, not `main`: a branch on Hugging Face moves. */
export const MODEL_HF_REVISION = "78708c9d002f0a8b3a089ec4620b95b650ef7d63";
export const MODEL_HF_PATH = "_models/E8.1-A8-R132-S45@11160M+(S45,46,47)@11520..11600M.onnx";

/** Port of DS hf_catalog.ts `hfFileUrl`: each path segment URL-encoded. */
export function hfFileUrl(repo: string, revision: string, path: string): string {
  return `https://huggingface.co/${repo}/resolve/${encodeURIComponent(revision)}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** The self-hosted copy, under the site's base path (`/TS_playfield/` in production). */
export const MODEL_URL = `${import.meta.env.BASE_URL}models/${MODEL_FILE}`;
/** Hugging Face at the pinned commit, tried when the self-hosted copy cannot be fetched or fails the hash. */
export const MODEL_HF_URL = hfFileUrl(MODEL_HF_REPO, MODEL_HF_REVISION, MODEL_HF_PATH);

/**
 * Leaderboard #1 (E8, Playdek scale 1821 ± 72; anchor 1774 ± 9): the B6 soup with
 * rollout(k=4, worlds=64, horizon=4, rule=z2, stop=earlier, leaf=own, chance=keyed, belief=2048,
 * aligned, box4, race=16). Every AI decision (each influence point, each event choice) with two or
 * more legal moves is one such search. Costs, measured in Node on one desktop core: median ~0.4 s,
 * p90 ~5 s, max ~11 s per decision, the spikes when the belief must weigh many opponent decisions.
 */
export const SEARCH = "rollout:4:64:4:z2:earlier:own:keyed:aligned:box4:belief2048:race16";

/**
 * Leaderboard #2 and Hugging Face's / DeepStruggle's site default: the same network and search
 * without the belief (Playdek 1794 ± 67; anchor 1735 ± 5), about a third of the thinking time
 * (median ~0.27 s, max ~1.2 s). NOT used: kept as the documented fallback should real devices prove
 * too slow for SEARCH (an owner decision; docs/notes/ai-pipeline.md §1.4, §12).
 */
export const SEARCH_NO_BELIEF = "rollout:4:64:4:z2:earlier:own:keyed:aligned:box4:race16";

/**
 * Every AI decision takes at least this long, so a fast answer (a near-forced choice, a reused
 * belief) tells the human nothing, and the board can follow one placement at a time.
 */
export const MIN_DELAY_MS = 600;

/**
 * Decisions whose mere existence is hidden information: Blockade (10), Missile Envy (49) and Latin
 * American Debt Crisis (95) ask the player whether to discard / which card to give. The AI pads these
 * to a delay drawn from its own recent search times (src/ai/index.ts), and the controller should pad
 * the AI's auto-played answers at these nodes the same way (`AiPlayerHandle.thinkingDelayMs`).
 */
export const SENSITIVE_RESOLVING_CARDS: readonly number[] = [10, 49, 95];

export const AI_CONFIG: AiConfig = {
  modelUrl: MODEL_URL,
  modelSha256: MODEL_SHA256,
  search: SEARCH,
  minDelayMs: MIN_DELAY_MS,
};
