/**
 * Everything the shell needs to wire the prompt layer into the game screen (ui-spec §15.3 W7):
 *
 *   const map = usePromptMapProps();          // spread into <MapView … {...map} />
 *   const hand = useHandProps();              // Hand offered / staged / liftedOut / mode / onActivate, China policy
 *   <Tray slip={<OrdersSlip variant="desktop" />} … />
 *   <PromptStage />                           // inside the table (z stage): the play-mode stage
 *   <PromptDialogs />                         // anywhere: branch / DEFCON dossiers, the card picker (portals)
 *   <CardZoomHost actions={card => <CardSheetActions card={card} />} />   // compact card sheet answers
 *
 * `promptSurface` says where the open prompt is answered (map, hand, stage, a dossier, region mode).
 */
import { useContext, useMemo, type ReactNode } from "react";
import type { Prompt, PublicState, Side } from "../../game/contract";
import { useI18n } from "../../i18n/react";
import { Button } from "../common/Button";
import { HoldButton } from "../common/HoldButton";
import { ShownContext } from "../runner/ShownContext";
import { OverlayContext, useUiRoot } from "../state/context";
import type { MapViewProps } from "../map/contract";
import type { OptionPolicy, RegionSlot } from "../ui-contract";
import { BranchDossier } from "./BranchDossier";
import { CardPicker } from "./CardPicker";
import { CountryTooltip } from "./CountryTooltip";
import { DefconDossier } from "./DefconDossier";
import { confirmLabel } from "./labels";
import { HAND_KINDS, handPolicies, MAP_KINDS, stampVerb } from "./policy";
import { PlayModeRows, PlayModeStage } from "./PlayModeStage";
import { regionTargetsOf } from "./regions";
import { QUEUE_KINDS } from "./store";
import { usePromptActions, policyContext } from "./usePromptActions";
import { usePromptTargets } from "./usePromptTargets";
import { usePromptUi } from "./useStaging";

export type PromptSurface = "map" | "hand" | "stage" | "branch" | "defcon" | "picker" | "region";

/** An event-card prompt whose cards are all in your hand (answered from the hand with verb stamps). */
export function isHandPicker(prompt: Prompt, state: PublicState | null, human: Side): boolean {
  if (prompt.kind !== "event-card") return false;
  const hand = new Set(state?.hands?.[human] ?? []);
  const cards = prompt.options.filter(o => o.kind === "card").map(o => o.id);
  return cards.length > 0 && cards.every(c => hand.has(c));
}

/** Where the open prompt is answered. */
export function promptSurface(prompt: Prompt | null, state: PublicState | null, human: Side): PromptSurface | null {
  if (!prompt) return null;
  if (MAP_KINDS.has(prompt.kind)) return "map";
  switch (prompt.kind) {
    case "headline": case "action-card": return "hand";
    case "event-card": return isHandPicker(prompt, state, human) ? "hand" : "picker";
    case "play-mode": case "op-mode": return "stage";
    case "branch": return "branch";
    case "defcon-level": return "defcon";
    case "region": return "region";
    default: return null;
  }
}

/** The MapView props the prompt layer owns (spread them into <MapView/>). */
export type PromptMapProps = Pick<MapViewProps,
  "targets" | "regionTargets" | "selection" | "focusRegion" | "interactive" | "onActivate" | "onHover" | "onRegionActivate" | "onRegionHover" | "renderTooltip">;

export function usePromptMapProps(): PromptMapProps {
  const root = useUiRoot();
  const shown = useContext(ShownContext);
  const actions = usePromptActions();
  const vm = root.vm;
  const prompt = vm.prompt;
  const state = shown?.state ?? vm.frame?.state ?? null;
  const human: Side = vm.humanSide ?? state?.humanSide ?? "US";
  const targets = usePromptTargets(prompt, state);
  const regionTargets = useMemo(() => (prompt?.kind === "region" ? regionTargetsOf(prompt) : null), [prompt]);
  const hoverRegion = usePromptUi("hoverRegion");
  const lastPrompt = usePromptUi("lastPrompt");
  const stagedRegion = actions.staged?.kind === "region" ? (actions.staged.id as RegionSlot) : null;
  // While your own placement animates, the frozen rings stay live: a quick second tap on one is queued for the
  // next point (usePromptActions) instead of falling through to the tooltip / double-tap zoom.
  const queueable = !!shown?.busy && shown.actor === human && !!targets && !!lastPrompt && QUEUE_KINDS.has(lastPrompt.kind)
    && (!prompt || prompt.promptId === lastPrompt.promptId);
  return {
    targets,
    regionTargets,
    selection: actions.staged?.kind === "country" ? actions.staged.id : null,
    focusRegion: prompt?.kind === "region" ? stagedRegion ?? hoverRegion : null,
    interactive: !shown?.busy || queueable,
    onActivate: actions.activateCountry,
    onHover: actions.hoverCountry,
    onRegionActivate: actions.activateRegion,
    onRegionHover: actions.hoverRegion,
    renderTooltip: (id: number) => (state ? <CountryTooltip country={id} prompt={prompt} state={state} humanSide={human} /> : null),
  };
}

export interface HandProps {
  /** Card id → policy for each card the open prompt offers from the hand (Hand.offered). */
  offered: ReadonlyMap<number, OptionPolicy>;
  /** The staged card (lifted with a verb stamp). */
  staged: number | null;
  /** The card on the play-mode stage (its hand slot shows the dashed outline). */
  liftedOut: number | null;
  /** active: the prompt is about the hand; passive: another prompt is open or the AI acts; neutral: idle. */
  mode: "neutral" | "active" | "passive";
  /** The stamp word key on the staged card: `ui:stamp.<verb>`. */
  stamp: "headline" | "discard" | "give" | "play";
  /** The China slot's policy (null when the China Card is not offered). */
  china: OptionPolicy | null;
  onActivate(card: number): void;
}

/** The hand's offers of the open prompt (pure): cards answered from the hand only. */
export function handOffers(prompt: Prompt | null, state: PublicState | null, human: Side, confirmFinal: boolean): ReadonlyMap<number, OptionPolicy> {
  if (!prompt || promptSurface(prompt, state, human) !== "hand") return new Map();
  return handPolicies(prompt, policyContext(prompt, state, confirmFinal, human));
}

export function useHandProps(): HandProps {
  const root = useUiRoot();
  const shown = useContext(ShownContext);
  const actions = usePromptActions();
  const vm = root.vm;
  const prompt = vm.prompt;
  const state = shown?.state ?? vm.frame?.state ?? null;
  const human: Side = vm.humanSide ?? state?.humanSide ?? "US";
  const offered = useMemo(() => handOffers(prompt, state, human, root.settings.confirmFinal), [prompt, state, human, root.settings.confirmFinal]);
  const active = !!prompt && HAND_KINDS.has(prompt.kind) && offered.size > 0;
  const mode: HandProps["mode"] = active ? "active" : prompt || vm.aiThinking || shown?.busy ? "passive" : "neutral";
  return {
    offered,
    staged: actions.staged?.kind === "card" && offered.has(actions.staged.id) ? actions.staged.id : null,
    liftedOut: prompt?.kind === "play-mode" ? prompt.pendingCard || null : null,
    mode,
    stamp: prompt ? stampVerb(prompt) : "play",
    china: offered.get(6) ?? null,
    onActivate: actions.activateCard,
  };
}

/**
 * The compact card sheet's answers for `card` (CardZoomHost.actions): the play-mode rows when the card
 * is on the stage, else one button that answers the prompt with it (the sheet itself was the first
 * activation, so the button commits; a certain loss needs the hold). Nothing for cards not offered.
 */
export function CardSheetActions({ card }: { card: number }): ReactNode {
  const i18n = useI18n();
  const root = useUiRoot();
  const shown = useContext(ShownContext);
  const overlays = useContext(OverlayContext);
  const actions = usePromptActions();
  const vm = root.vm;
  const prompt = vm.prompt;
  const state = shown?.state ?? vm.frame?.state ?? null;
  const human: Side = vm.humanSide ?? "US";
  if (!prompt || !actions.interactive) return null;
  if ((prompt.kind === "play-mode" || prompt.kind === "op-mode") && prompt.pendingCard === card) {
    return <PlayModeRows prompt={prompt} compact />;
  }
  const option = promptSurface(prompt, state, human) === "hand" ? prompt.options.find(o => o.kind === "card" && o.id === card) : undefined;
  if (!option) return null;
  const label = confirmLabel(i18n, prompt, option, state, human);
  const pol = actions.policyOf(option);
  const commit = () => { overlays?.closeZoom(); actions.commit(option.idx); };
  if (pol.commit === "hold") {
    return <HoldButton label={label} onPaper={false} onConfirm={commit}>{label}</HoldButton>;
  }
  return <Button variant="brass" size="touch" onClick={commit}>{label}</Button>;
}

/** The play-mode stage of the open prompt (mount inside the table area). */
export function PromptStage() {
  const root = useUiRoot();
  const shown = useContext(ShownContext);
  const prompt = root.vm.prompt;
  if (!prompt || shown?.busy || (prompt.kind !== "play-mode" && prompt.kind !== "op-mode")) return null;
  return <PlayModeStage key={prompt.promptId} prompt={prompt} />;
}

/** The modal dossier of the open prompt (branch, DEFCON level, card picker), if it needs one. */
export function PromptDialogs() {
  const root = useUiRoot();
  const shown = useContext(ShownContext);
  const vm = root.vm;
  const prompt = vm.prompt;
  const state = shown?.state ?? vm.frame?.state ?? null;
  if (!prompt || shown?.busy) return null;
  switch (promptSurface(prompt, state, vm.humanSide ?? "US")) {
    case "branch": return <BranchDossier prompt={prompt} />;
    case "defcon": return <DefconDossier prompt={prompt} />;
    case "picker": return <CardPicker prompt={prompt} />;
    default: return null;
  }
}
