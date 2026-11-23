/**
 * The rail's sections wired to the game (they read `useRailData()` and keep the rail's beats registered),
 * for every host: the desktop Rail, the tablet flyouts (RailFlyout) and the compact sheets (the shell's
 * CompactSheets: "Adversary" = AdversarySection + EffectsSection, "Log" = DispatchesSection, "Status" =
 * the console's StatusPanel).
 */
import { useUiRoot } from "../state/context";
import { StatusPanel } from "../console/StatusPanel";
import { AdversaryDossier } from "./AdversaryDossier";
import { Dispatches } from "./Dispatches";
import { EffectsStrip } from "./EffectsStrip";
import { useRailBeats } from "./useRailBeats";
import { useRailData } from "./useRailData";

export type RailPanelName = "adversary" | "effects" | "log" | "status";

export function AdversarySection({ className }: { className?: string }) {
  const root = useUiRoot();
  const d = useRailData();
  useRailBeats(root.director, d.aiSide);
  if (!d.state) return null;
  return <AdversaryDossier state={d.state} aiSide={d.aiSide} status={d.status} className={className} />;
}

export function EffectsSection({ bare, className }: { bare?: boolean; className?: string }) {
  const root = useUiRoot();
  const d = useRailData();
  useRailBeats(root.director, d.aiSide);
  return <EffectsStrip flags={d.state?.flags ?? []} bare={bare} className={className} />;
}

export function DispatchesSection({ bare, className }: { bare?: boolean; className?: string }) {
  const root = useUiRoot();
  const d = useRailData();
  useRailBeats(root.director, d.aiSide);
  return <Dispatches log={d.log} humanSide={d.humanSide} current={d.current} bare={bare} className={className} />;
}

/** One panel by name (tablet flyouts, compact sheets). */
export function RailPanel({ panel, bare, className }: { panel: RailPanelName; bare?: boolean; className?: string }) {
  switch (panel) {
    case "adversary": return <AdversarySection className={className} />;
    case "effects": return <EffectsSection bare={bare} className={className} />;
    case "log": return <DispatchesSection bare={bare} className={className} />;
    case "status": return <StatusPanel heading={!bare} className={className} />;
  }
}
