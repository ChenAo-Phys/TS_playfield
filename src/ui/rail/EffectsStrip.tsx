/**
 * In effect (ui-spec §6.2): one chip per ongoing effect in `state.flags` that `effectInfo` knows. Each chip
 * has the side glyph (none for BOTH / NEUTRAL), an 18×25 thumbnail of the card (top crop), the short name
 * (`effectText(flag).short`) and the duration, with a 3 px bar in the side colour on its left. Order: this
 * turn → conditional → permanent → space perks. Hover or focus → the description; click → card zoom.
 * The section header is the `effects` anchor. Chips arrive (shrinking into place) and tear off with the
 * `effect` beats (useRailBeats).
 */
import { useContext, useId, useRef, useState } from "react";
import { effectInfo, type EffectDuration, type EffectInfo } from "../../data";
import { effectText } from "../../i18n";
import { useI18n } from "../../i18n/react";
import { useCardImageUrl } from "../cards/cardImages";
import { Popover } from "../common/Popover";
import { SideGlyph } from "../common/SideGlyph";
import { useHoverIntent } from "../common/hooks";
import { useAnchorRef } from "../console/Instrument";
import { UiRootContext } from "../state/context";
import { useRailView, type RailView } from "./railStore";
import s from "./Rail.module.css";

export interface EffectsStripProps {
  flags: readonly string[];
  // ── extensions ──
  /** Without its "In effect" header (the tablet flyout has its own title). */
  bare?: boolean;
  className?: string;
}

const ORDER: Readonly<Record<EffectDuration, number>> = { TURN: 0, CONDITIONAL: 1, PERMANENT: 2, SPACE_PERK: 3 };

/** The chips to show, in display order (pure: flags with effect info, this turn first). */
export function effectChips(flags: readonly string[], arriving: readonly string[] = []): { flag: string; info: EffectInfo }[] {
  const seen = new Set<string>();
  const out: { flag: string; info: EffectInfo; i: number }[] = [];
  [...flags, ...arriving].forEach((flag, i) => {
    if (seen.has(flag)) return;
    seen.add(flag);
    const info = effectInfo(flag);
    if (info) out.push({ flag, info, i });
  });
  out.sort((a, b) => ORDER[a.info.duration] - ORDER[b.info.duration] || a.i - b.i);
  return out.map(({ flag, info }) => ({ flag, info }));
}

function Chip({ flag, info, anim }: { flag: string; info: EffectInfo; anim: { on?: RailView["fxOn"][string]; off?: RailView["fxOff"][string] } }) {
  const root = useContext(UiRootContext);
  const { t, lang } = useI18n();
  const img = useCardImageUrl();
  const el = useRef<HTMLButtonElement | null>(null);
  const [focused, setFocused] = useState(false);
  const hover = useHoverIntent(250);
  const tipId = useId();
  void lang; // effectText reads the current language; `lang` re-renders on a switch
  const text = effectText(flag);
  const name = text?.short ?? info.cardName;
  const duration = t(`ui:effects.duration.${info.duration}`);
  const side = info.side === "US" || info.side === "USSR" ? info.side : null;
  const open = (hover.active || focused) && !!text?.description && !anim.off;
  const motion = anim.off ? anim.off : anim.on;
  const cls = [
    s.fx,
    side === "US" ? s.fxUs : side === "USSR" ? s.fxUssr : s.fxBoth,
    anim.off ? (anim.off.reduced || !anim.off.ms ? s.fxGone : s.fxTear) : anim.on && !anim.on.reduced && anim.on.ms ? s.fxPin : "",
  ].filter(Boolean).join(" ");
  return (
    <li className={s.fxItem}>
      <button
        ref={el}
        type="button"
        className={cls}
        style={motion && motion.ms ? { animationDuration: `${motion.ms}ms` } : undefined}
        data-flag={flag}
        data-duration={info.duration}
        aria-label={t("ui_console:effects.chip", { name: text?.name ?? name, duration })}
        aria-describedby={open ? tipId : undefined}
        onClick={() => root?.zoomCard(info.cardId, el.current)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...hover.bind}
      >
        {side ? <SideGlyph side={side} className={s.fxGlyph} /> : <span className={s.fxGlyph} />}
        <img src={img(info.cardId)} alt="" width={18} height={25} loading="lazy" decoding="async" />
        <span className={s.fxName}>{name}</span>
        <span className={s.fxDur}>{duration}</span>
      </button>
      {open && el.current ? (
        <Popover anchor={el.current} tone="paper" role="tooltip" placement="left" passThrough id={tipId} gap={10}>
          <div className={s.fxTip}>
            <b>{text?.name}</b>
            <p>{text?.description}</p>
          </div>
        </Popover>
      ) : null}
    </li>
  );
}

export function EffectsStrip({ flags, bare = false, className }: EffectsStripProps) {
  const { t } = useI18n();
  const rail = useRailView();
  const headRef = useAnchorRef("effects");
  const chips = effectChips(flags, Object.keys(rail.fxOn));
  return (
    <section className={[s.effects, className].filter(Boolean).join(" ")} aria-label={t("ui:effects.title")}>
      {bare ? <span ref={headRef} className={s.fxAnchor} aria-hidden="true" /> : (
        <div ref={headRef} className={[s.panelH, s.flush].join(" ")}>
          <h2>{t("ui:effects.title")}</h2>
          <span className={s.count}>{chips.length}</span>
        </div>
      )}
      {chips.length ? (
        <ul className={s.fxList}>
          {chips.map(c => <Chip key={c.flag} flag={c.flag} info={c.info} anim={{ on: rail.fxOn[c.flag], off: rail.fxOff[c.flag] }} />)}
        </ul>
      ) : (
        <p className={s.empty}>{t("ui_console:effects.empty")}</p>
      )}
    </section>
  );
}
