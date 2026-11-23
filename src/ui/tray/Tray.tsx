/**
 * The tray (ui-spec §3.1, §7.2–§7.4, §15.3 W6): the near edge of the table, overlaying the bottom of the
 * map (z tray) with a fade and the walnut edge. Left to right: the orders slip (given as `slip`), the
 * headline slot (when you have committed a headline), the hand, the China Card slot and the piles.
 *
 * Props-driven for the prompt layer: the shell computes `offered` / `staged` with src/ui/prompts and
 * passes `OrdersSlip` as `slip`. The tray draws `Shown.state` (plus its beat overrides), reads the
 * prompt only for the hand's mode, the lifted-out card and the stamp verb, and keeps the last
 * prompt's look while your own click resolves (no flicker; nothing activates then).
 */
import { useMemo, useRef, type KeyboardEvent, type ReactNode } from "react";
import { CHINA_CARD } from "../../data";
import type { Prompt, PublicState, Side } from "../../game/contract";
import { useShown } from "../runner/ShownContext";
import { useUiRoot } from "../state/context";
import type { OptionPolicy } from "../ui-contract";
import { ChinaSlot } from "./ChinaSlot";
import { Hand, moveCardFocus } from "./Hand";
import { HeadlineSlot } from "./HeadlineSlot";
import { Piles } from "./Piles";
import { handMode, headlineSlotOf, knownToAi, liftedOutCard, stampVerb, type HandMode, type StampVerb, type TrayVariant } from "./trayModel";
import type { TrayOverrides } from "./trayBeats";
import { useTrayOverrides, WithTrayBeats } from "./useTrayBeats";
import s from "./Tray.module.css";

export interface TrayProps {
  variant: TrayVariant;
  /** The orders slip (src/ui/prompts OrdersSlip), placed in the tray's left slot. */
  slip: ReactNode;
  /** Card options of the current prompt (hand cards and the China Card), from the prompt layer. */
  offered: ReadonlyMap<number, OptionPolicy>;
  /** The staged card (first activation of a staged choice), or null. */
  staged: number | null;
  onActivateCard(card: number): void;
  onOpenPile(pile: "discard" | "removed"): void;
  className?: string;
}

export function Tray(props: TrayProps) {
  return <WithTrayBeats><TrayBody {...props} /></WithTrayBeats>;
}

/** What the hand shows for the current prompt (frozen while your own click resolves). */
export interface HandView {
  mode: HandMode;
  offered: ReadonlyMap<number, OptionPolicy>;
  staged: number | null;
  lifted: number | null;
  verb: StampVerb;
  /** Clicks activate. */
  interactive: boolean;
}

const NONE: ReadonlyMap<number, OptionPolicy> = new Map();

export interface HandViewInput {
  prompt: Prompt | null;
  state: PublicState | null;
  human: Side | null;
  offered: ReadonlyMap<number, OptionPolicy>;
  staged: number | null;
  busy: boolean;
  actor: Side | null;
  aiThinking: boolean;
  overrides: TrayOverrides;
}

/**
 * The hand's view (pure; shared by Tray and HandDrawer). Live while a prompt is open. While your own
 * frames resolve (no prompt, no AI activity yet) it keeps the last prompt's view, inert, so the hand
 * does not flicker; once the AI acts that memory is dropped and the hand is passive (or neutral).
 * Returns the view and the memory to pass next time.
 */
export function computeHandView(o: HandViewInput, last: HandView | null): { view: HandView; last: HandView | null } {
  const hand = o.state && o.human ? o.state.hands[o.human] : [];
  const holdsChina = !!o.state && !!o.human && (o.overrides.china ?? o.state.china_card).holder === o.human;
  if (o.prompt) {
    const view: HandView = {
      mode: handMode({ prompt: o.prompt, hand, offered: o.offered, holdsChina, busy: o.busy, aiThinking: o.aiThinking }),
      offered: o.offered,
      staged: o.staged,
      lifted: liftedOutCard(o.prompt, hand, holdsChina),
      verb: stampVerb(o.prompt),
      interactive: !o.busy,
    };
    return { view, last: view };
  }
  const aiActing = o.aiThinking || (o.busy && o.actor !== null && o.actor !== o.human);
  const frozen = aiActing ? null : last;
  if (frozen) {
    const lifted = frozen.lifted !== null && (hand.includes(frozen.lifted) || (frozen.lifted === CHINA_CARD && holdsChina)) ? frozen.lifted : null;
    return { view: { ...frozen, lifted, interactive: false }, last: frozen };
  }
  return {
    view: {
      mode: handMode({ prompt: null, hand, offered: NONE, busy: o.busy, aiThinking: o.aiThinking }),
      offered: NONE,
      staged: null,
      lifted: null,
      verb: "play",
      interactive: false,
    },
    last: null,
  };
}

/** `computeHandView` with its memory kept across renders. */
export function useHandView(o: HandViewInput): HandView {
  const last = useRef<HandView | null>(null);
  const { view, last: next } = computeHandView(o, last.current);
  last.current = next;
  return view;
}

function TrayBody({ variant, slip, offered, staged, onActivateCard, onOpenPile, className }: TrayProps) {
  const root = useUiRoot();
  const vm = root.vm;
  const shown = useShown();
  const ov = useTrayOverrides();
  const state = shown.state;
  const human = vm.humanSide;
  const view = useHandView({
    prompt: vm.prompt, state, human, offered, staged, busy: shown.busy, actor: shown.actor, aiThinking: vm.aiThinking, overrides: ov,
  });
  const hand = state && human ? state.hands[human] : null;
  const known = useMemo(() => {
    const set = new Set<number>(ov.known);
    if (state && human) for (const c of state.hands[human]) if (knownToAi(state, human, c)) set.add(c);
    return set;
  }, [state, human, ov.known]);

  const cls = [s.tray, s[variant], className].filter(Boolean).join(" ");
  if (!state || !human || !hand) {
    return <div className={cls} data-variant={variant}><div className={s.slipSlot}>{slip}</div></div>;
  }
  const china = ov.china ?? state.china_card;
  const headline = ov.headline ?? headlineSlotOf(state, human);
  const chinaPolicy = china.holder === human ? view.offered.get(CHINA_CARD) ?? null : null;
  // ←/→ continue from the hand's last card to the China Card and back (the hand handles its own cards).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    const from = (e.target as Element).closest("[data-hand-card]");
    if (from && moveCardFocus(e.currentTarget, from, e.key === "ArrowLeft" ? -1 : 1)) e.preventDefault();
  };
  return (
    <div className={cls} data-variant={variant} data-mode={view.mode} onKeyDown={onKeyDown}>
      <div className={s.slipSlot}>{slip}</div>
      {headline ? <HeadlineSlot card={headline.card} faceDown={headline.faceDown} variant={variant} humanSide={human} /> : null}
      <Hand
        cards={hand}
        offered={view.offered}
        staged={view.staged}
        liftedOut={view.lifted}
        mode={view.mode}
        onActivate={onActivateCard}
        variant={variant}
        humanSide={human}
        known={known}
        gone={ov.gone}
        blink={ov.blink}
        blinkMs={ov.blinkMs}
        verb={view.verb}
        interactive={view.interactive}
      />
      <ChinaSlot
        china={china}
        humanSide={human}
        policy={chinaPolicy}
        onActivate={() => onActivateCard(CHINA_CARD)}
        variant={variant}
        mode={view.mode}
        staged={view.staged === CHINA_CARD}
        lifted={view.lifted === CHINA_CARD || ov.gone.has(CHINA_CARD)}
        verb={view.verb}
        interactive={view.interactive}
      />
      <Piles deck={state.draw_deck_count} discard={state.discard_pile} removed={state.removed_pile} onOpen={onOpenPile} variant={variant} />
    </div>
  );
}
