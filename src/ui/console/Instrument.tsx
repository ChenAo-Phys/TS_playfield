/**
 * One console instrument (ui-spec §5): a focusable group with an accessible summary, its anchor
 * registered for flights and chips, and a room-toned tooltip on hover (250 ms) or keyboard focus.
 * The tooltip is a `role="tooltip"` popover the instrument points at with aria-describedby; Esc hides it.
 */
import { useCallback, useContext, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Popover } from "../common/Popover";
import { useHoverIntent } from "../common/hooks";
import { UiRootContext } from "../state/context";
import type { AnchorId } from "../ui-contract";
import s from "./Console.module.css";

export interface InstrumentProps {
  /** Accessible summary ("DEFCON 3: no coups or realignments in Europe, Asia"). */
  label: string;
  /** Anchor id registered on the instrument (flights, the VP chip, dice). */
  anchor?: AnchorId | readonly AnchorId[];
  /** Tooltip body (room tone); none when absent. */
  tip?: ReactNode;
  className?: string;
  children: ReactNode;
  /** Extra data attributes for tests / styling. */
  data?: Record<string, string | number | undefined>;
}

/** The ref callback for an anchor id (none outside a UiRoot). */
export function useAnchorRef(id: AnchorId | readonly AnchorId[] | undefined): ((el: Element | null) => void) | undefined {
  const root = useContext(UiRootContext);
  const anchors = root?.anchors ?? null;
  const key = id === undefined ? "" : typeof id === "string" ? id : id.join("|");
  return useMemo(() => {
    if (!anchors || !key) return undefined;
    const refs = (key.split("|") as AnchorId[]).map(a => anchors.ref(a));
    return refs.length === 1 ? refs[0] : (el: Element | null) => { for (const r of refs) r(el); };
  }, [anchors, key]);
}

export function Instrument({ label, anchor, tip, className, children, data }: InstrumentProps) {
  const el = useRef<HTMLDivElement | null>(null);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const hover = useHoverIntent(250, { enabled: !!tip, onStart: () => setDismissed(false) });
  const anchorRef = useAnchorRef(anchor);
  const setRef = useCallback((node: HTMLDivElement | null) => {
    el.current = node;
    anchorRef?.(node);
  }, [anchorRef]);
  const tipId = useId();
  const open = !!tip && !dismissed && (hover.active || focused);
  const dataAttrs = Object.fromEntries(Object.entries(data ?? {}).filter(([, v]) => v !== undefined).map(([k, v]) => [`data-${k}`, String(v)]));
  return (
    <div
      ref={setRef}
      className={[s.inst, className].filter(Boolean).join(" ")}
      role="group"
      aria-label={label}
      aria-describedby={open ? tipId : undefined}
      tabIndex={tip ? 0 : undefined}
      onFocus={e => { if (e.target === e.currentTarget) { setFocused(true); setDismissed(false); } }}
      onBlur={e => { if (e.target === e.currentTarget) setFocused(false); }}
      {...hover.bind}
      {...dataAttrs}
    >
      {children}
      {open && el.current ? (
        <Popover anchor={el.current} tone="room" role="tooltip" placement="bottom" passThrough id={tipId} onClose={() => setDismissed(true)} gap={8}>
          <div className={s.tip}>{tip}</div>
        </Popover>
      ) : null}
    </div>
  );
}
