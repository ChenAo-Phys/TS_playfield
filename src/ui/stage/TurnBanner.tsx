/**
 * The turn banner (ui-spec §10.3, §9.4 `turn-start` / `phase` HEADLINE): a paper strip 60 % of the table
 * wide at 28 % of its height; the line types in ("Turn 6 · Mid War", 18 ms a character) over a ruled
 * underline. Turns 4 and 8 add a rubber stamp ("Mid War: new cards shuffled in") and a pulse on the draw
 * pile. The headline phase shows a plate "Headline phase". Reduced motion: fades, same hold.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { useI18n } from "../../i18n/react";
import { Stamp } from "../common/Stamp";
import { useUiRoot } from "../state/context";
import { useReducedMotion } from "../state/useReducedMotion";
import type { BannerState } from "./stageStore";
import { useStageBeats, useStageState, useStageStore } from "./useStage";
import s from "./TurnBanner.module.css";

/** Typewriter speed (ui-spec §9.4: 18 ms per character). */
export const TYPE_MS_PER_CHAR = 18;

export function TurnBanner() {
  const store = useStageStore();
  useStageBeats(["banner"], store);
  const banner = useStageState(st => st.banner, store);
  if (!banner) return null;
  return <TurnBannerView key={banner.key} banner={banner} />;
}

export function TurnBannerView({ banner }: { banner: BannerState }) {
  const root = useUiRoot();
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const text = banner.kind === "turn"
    ? t("ui:banner.turn", { turn: banner.turn, era: t(`ui:track.era.${banner.era}`) })
    : t("ui:banner.headlinePhase");
  const typed = useTypewriter(text, reduced || banner.ms.in <= 0 ? 0 : TYPE_MS_PER_CHAR);
  const deck = banner.eraStamp && banner.phase !== "in" ? root.anchors.rect("deck") : null;
  const style = { ["--in" as string]: `${banner.ms.in}ms`, ["--out" as string]: `${banner.ms.out}ms` } as CSSProperties;
  return (
    <>
      <div className={s.banner} data-phase={banner.phase} data-kind={banner.kind} data-reduced={reduced || undefined} style={style} role="status" aria-live="polite">
        <p className={s.line}>
          <span className={s.ghost} aria-hidden="true">{text}</span>
          <span className={s.typed} aria-hidden="true">{typed}</span>
          <span className="ts-vh">{text}</span>
        </p>
        <span className={s.rule} aria-hidden="true" />
        {banner.eraStamp && banner.phase !== "in" ? (
          <Stamp tone="alert" size="m" tilt={-6} className={s.stamp}>{t(`ui:banner.era.${banner.eraStamp}`)}</Stamp>
        ) : null}
      </div>
      {deck ? <DeckPulse rect={deck} reduced={reduced} /> : null}
    </>
  );
}

/** A brass ring over the draw pile (new era cards shuffled in). Positioned in viewport px. */
function DeckPulse({ rect, reduced }: { rect: DOMRect; reduced: boolean }) {
  return (
    <span
      className={s.pulse}
      aria-hidden="true"
      data-reduced={reduced || undefined}
      style={{ left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8 }}
    />
  );
}

/** The first characters of `text`, one more every `msPerChar` (0: all at once). */
export function useTypewriter(text: string, msPerChar: number): string {
  const chars = [...text];
  const [n, setN] = useState(msPerChar > 0 ? 0 : chars.length);
  useEffect(() => {
    if (msPerChar <= 0) {
      setN(chars.length);
      return;
    }
    setN(0);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setN(i);
      if (i >= chars.length) clearInterval(id);
    }, msPerChar);
    return () => clearInterval(id);
  }, [text, msPerChar]);
  return chars.slice(0, n).join("");
}
