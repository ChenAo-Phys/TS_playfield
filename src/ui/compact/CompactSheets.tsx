/**
 * The compact dock's sheets (ui-spec §3.3): the hand drawer (kept mounted, so the tray beats keep
 * running), the adversary dossier + In effect, the Dispatches (full height), and Status (every
 * instrument at full size + the piles).
 */
import { useI18n } from "../../i18n/react";
import { Sheet } from "../common/Sheet";
import { StatusPanel } from "../console/StatusPanel";
import { AdversarySection, DispatchesSection, EffectsSection } from "../rail";
import { useShown } from "../runner/ShownContext";
import { HandDrawer, Piles } from "../tray";
import type { OptionPolicy } from "../ui-contract";
import type { DockPanel } from "./BottomDock";
import s from "./compact.module.css";

export interface CompactSheetsProps {
  panel: DockPanel | null;
  onClose(): void;
  offered: ReadonlyMap<number, OptionPolicy>;
  staged: number | null;
  onActivateCard(card: number): void;
  onOpenPile(pile: "discard" | "removed"): void;
}

export function CompactSheets({ panel, onClose, offered, staged, onActivateCard, onOpenPile }: CompactSheetsProps) {
  const { t } = useI18n();
  const shown = useShown();
  const st = shown.state;
  return (
    <>
      <HandDrawer open={panel === "hand"} onClose={onClose} offered={offered} staged={staged} onActivateCard={onActivateCard} />
      <Sheet open={panel === "adversary"} onClose={onClose} height="auto" label={t("ui:adversary.title")}>
        <div className={s.sheetBody}>
          <AdversarySection />
          <EffectsSection />
        </div>
      </Sheet>
      <Sheet open={panel === "log"} onClose={onClose} height="80%" label={t("ui:log.title")}>
        <div className={[s.sheetBody, s.sheetFill].join(" ")}>
          <DispatchesSection bare />
        </div>
      </Sheet>
      <Sheet open={panel === "status"} onClose={onClose} height="80%" label={t("ui_console:status.title")}>
        <div className={s.sheetBody}>
          <StatusPanel
            after={st ? <Piles deck={st.draw_deck_count} discard={st.discard_pile} removed={st.removed_pile} onOpen={onOpenPile} variant="panel" /> : null}
          />
          <EffectsSection />
        </div>
      </Sheet>
    </>
  );
}
