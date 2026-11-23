/**
 * Tags that hang from a card's top edge (ui-spec §7.1, §8.3): SCORING (hazard), STRANDS A SCORING CARD
 * (hazard), "<side> EVENT" for an opponent's card played for Ops (info, with the side glyph), KNOWN TO AI
 * (eye; `compact`: the eye alone, for a narrow overlapped strip). `CardTags` picks them from the card, its
 * prompt option's warnings and its location; pass the result to CardFace `tags`.
 */
import type { ReactNode } from "react";
import { cardInfo } from "../../data";
import type { Side, Warning } from "../../game/contract";
import { useI18n } from "../../i18n/react";
import { Icon } from "../common/Icon";
import { SideGlyph } from "../common/SideGlyph";
import s from "./cards.module.css";

export type CardTagTone = "scoring" | "hazard" | "info" | "known";

export function CardTag({ tone, children, compact = false, title }: { tone: CardTagTone; children: ReactNode; /** Icon only: tighter padding. */ compact?: boolean; title?: string }) {
  return <span className={[s.tag, s[`tag_${tone}`], compact ? s.tagCompact : ""].filter(Boolean).join(" ")} data-tone={tone} data-compact={compact || undefined} title={title}>{children}</span>;
}

export interface CardTagsProps {
  card: number;
  /** The card's option warnings at the current prompt (PromptOption.warnings). */
  warnings?: readonly Warning[];
  /** The card's location is HAND_<human>_KNOWN. */
  known?: boolean;
  /** Leave out the SCORING tag (e.g. where the scoring state is shown otherwise). */
  noScoring?: boolean;
  /**
   * Narrow card strip (an overlapped hand card): KNOWN TO AI shrinks to its eye icon. The words stay for
   * assistive technology and in the tag's tooltip.
   */
  compact?: boolean;
}

/** Which tags a card carries, in display order (pure; for tests and custom layouts). */
export function cardTagKinds(card: number, warnings: readonly Warning[] = [], known = false, noScoring = false): ("scoring" | "strands" | "opponent" | "known")[] {
  const out: ("scoring" | "strands" | "opponent" | "known")[] = [];
  if (cardInfo(card)?.scoring && !noScoring) out.push("scoring");
  if (warnings.some(w => w.code === "scoring-stranded")) out.push("strands");
  if (warnings.some(w => w.code === "opponent-event")) out.push("opponent");
  if (known) out.push("known");
  return out;
}

export function CardTags({ card, warnings = [], known = false, noScoring = false, compact = false }: CardTagsProps) {
  const { t, sideName } = useI18n();
  const kinds = cardTagKinds(card, warnings, known, noScoring);
  if (!kinds.length) return null;
  const opp = warnings.find(w => w.code === "opponent-event");
  const oppSide = (String(opp?.params?.side ?? cardInfo(card)?.side ?? "") || "US") as Side;
  return (
    <>
      {kinds.map(k => {
        switch (k) {
          case "scoring":
            return <CardTag key={k} tone="scoring">{t("ui_common:tag.scoring")}</CardTag>;
          case "strands":
            return <CardTag key={k} tone="hazard">{t("ui_common:tag.strands")}</CardTag>;
          case "opponent":
            return (
              <CardTag key={k} tone="info">
                <SideGlyph side={oppSide === "USSR" ? "USSR" : "US"} />
                {t("ui_common:tag.opponentEvent", { side: sideName(oppSide) })}
              </CardTag>
            );
          case "known":
            return compact
              ? <CardTag key={k} tone="known" compact title={t("ui_common:tag.known")}><Icon name="eye" /><span className="ts-vh">{t("ui_common:tag.known")}</span></CardTag>
              : <CardTag key={k} tone="known"><Icon name="eye" />{t("ui_common:tag.known")}</CardTag>;
        }
      })}
    </>
  );
}
