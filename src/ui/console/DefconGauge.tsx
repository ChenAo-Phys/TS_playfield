/**
 * DEFCON instrument (ui-spec §5): the stencil numeral in its lamp colour, five lamps 5 → 1 with the
 * current one lit, and the restriction caption (`ui:track.defconRuleShort.N`, ≤ 40 characters).
 * Compact: the numeral and the word "DEFCON". `word` (tablet) renders the word beside the lamps too: the tablet
 * console's squeeze step 1 shows it instead of the lamps (R3-06). When a `defcon` beat degrades the level the new
 * lamp flickers twice and lights; an improvement cross-fades.
 */
import { useI18n } from "../../i18n/react";
import { clampDefcon } from "./model";
import { Instrument } from "./Instrument";
import { useTrackView } from "./trackStore";
import s from "./Console.module.css";

export interface DefconGaugeProps {
  defcon: number;
  variant: "full" | "compact";
  // ── extensions ──
  /** Show the restriction caption (full variant; hidden on tablets). Default true. */
  caption?: boolean;
  /** Full variant: also render the word "DEFCON" (hidden unless the tablet console's squeeze shows it for the lamps). */
  word?: boolean;
  className?: string;
}

const LAMPS = [5, 4, 3, 2, 1] as const;

export function DefconTip({ defcon }: { defcon: number }) {
  const { t } = useI18n();
  const n = clampDefcon(defcon);
  return (
    <>
      <div className={s.tipHead}>{t("ui:track.defconLevel", { level: n })}</div>
      <div className={s.tipRow}>{t(`ui:track.defconRule.${n}`)}</div>
    </>
  );
}

export function DefconGauge({ defcon, variant, caption = true, word = false, className }: DefconGaugeProps) {
  const { t } = useI18n();
  const view = useTrackView();
  const n = clampDefcon(defcon);
  const anim = view.anim.defcon;
  const moving = anim && anim.to === n && anim.ms > 0 ? anim : null;
  const label = t("ui_console:defcon.aria", { level: n, rule: t(`ui:track.defconRule.${n}`) });
  return (
    <Instrument
      label={label}
      anchor="defcon"
      tip={<DefconTip defcon={n} />}
      className={[s.defcon, variant === "compact" ? s.defconCompact : "", className].filter(Boolean).join(" ")}
      data={{ defcon: n }}
    >
      <span
        key={moving ? `n${moving.seq}` : "n"}
        className={[s.defconNum, s[`l${n}`], moving ? s.numIn : ""].filter(Boolean).join(" ")}
        style={moving ? { animationDuration: `${Math.min(moving.ms, 400)}ms` } : undefined}
        aria-hidden="true"
      >
        {n}
      </span>
      {variant === "compact" ? (
        <div className={s.defconSub} aria-hidden="true">{t("ui:track.defcon")}</div>
      ) : (
        <div className={s.defconSide}>
          <div className={s.lamps} aria-hidden="true">
            {LAMPS.map(l => {
              const on = l === n;
              const fx = on && moving ? (moving.reduced ? s.lampFade : moving.to < moving.from ? s.lampFlicker : s.lampFade) : "";
              return (
                <span
                  key={on && moving ? `${l}:${moving.seq}` : l}
                  className={[s.lamp, s[`lamp${l}`], on ? s.on : "", fx].filter(Boolean).join(" ")}
                  style={fx ? { animationDuration: `${moving!.ms}ms` } : undefined}
                >
                  {l}
                </span>
              );
            })}
          </div>
          {caption ? <div className={s.defconCaption} aria-hidden="true">{t(`ui:track.defconRuleShort.${n}`)}</div> : null}
          {word ? <div className={[s.defconSub, s.defconWord].join(" ")} aria-hidden="true">{t("ui:track.defcon")}</div> : null}
        </div>
      )}
    </Instrument>
  );
}
