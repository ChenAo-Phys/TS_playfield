/**
 * Line icons (24 grid, `currentColor`), ui-spec §2.4. Paths from docs/design/mockup-final-assets/final.js
 * `ICON`, plus close, external, eye and list. Always decorative: the control that holds an icon names it.
 */
import type { ReactElement } from "react";
import s from "./common.module.css";

export type IconName =
  | "event" | "influence" | "coup" | "realign" | "space" | "log" | "status" | "gear" | "menu"
  | "undo" | "skip" | "chevron-up" | "close" | "external" | "eye" | "list";

/** Every icon name, in a stable order (demo sheet, tests). */
export const ICON_NAMES: readonly IconName[] = [
  "event", "influence", "coup", "realign", "space", "log", "status", "gear", "menu",
  "undo", "skip", "chevron-up", "close", "external", "eye", "list",
];

interface IconDef {
  /** Stroke width; 0 = a filled icon. */
  sw: number;
  body: ReactElement;
}

const GEAR =
  "M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z";

const ICONS: Record<IconName, IconDef> = {
  event: { sw: 2, body: <><path d="M4 5h13v14H6a2 2 0 0 1-2-2z" /><path d="M17 8h3v9a2 2 0 0 1-2 2" /><path d="M7 9h7M7 12h7M7 15h4" /></> },
  influence: { sw: 2, body: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M12 8v8M8 12h8" /></> },
  coup: { sw: 2, body: <><circle cx="12" cy="12" r="7" /><path d="M12 2v5M12 17v5M2 12h5M17 12h5" /></> },
  realign: { sw: 2, body: <path d="M4 9h14l-4-4M20 15H6l4 4" /> },
  space: { sw: 2, body: <><path d="M12 2c3 2.5 4.5 6 4.5 10.5L12 17l-4.5-4.5C7.5 8 9 4.5 12 2z" /><path d="M7.5 12.5 5 15l2 2M16.5 12.5 19 15l-2 2M10 19l2 3 2-3" /><circle cx="12" cy="9" r="1.6" /></> },
  log: { sw: 2, body: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></> },
  status: { sw: 2, body: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /> },
  gear: { sw: 1.8, body: <><circle cx="12" cy="12" r="3.2" /><path d={GEAR} /></> },
  menu: { sw: 2, body: <path d="M4 7h16M4 12h16M4 17h16" /> },
  undo: { sw: 2.2, body: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></> },
  skip: { sw: 0, body: <path d="M4 5l8 7-8 7zM12 5l8 7-8 7z" /> },
  "chevron-up": { sw: 2.4, body: <path d="m6 15 6-6 6 6" /> },
  close: { sw: 2.2, body: <path d="M6 6l12 12M18 6 6 18" /> },
  external: { sw: 2, body: <><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></> },
  eye: { sw: 2, body: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></> },
  list: { sw: 2, body: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" strokeWidth="3" /></> },
};

export interface IconProps {
  name: IconName;
  /** Rendered size in CSS px; default 1em. */
  size?: number;
  className?: string;
}

export function Icon({ name, size, className }: IconProps) {
  const def = ICONS[name];
  const filled = def.sw === 0;
  return (
    <svg
      className={[s.icon, className].filter(Boolean).join(" ")}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? undefined : "currentColor"}
      strokeWidth={filled ? undefined : def.sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-icon={name}
    >
      {def.body}
    </svg>
  );
}
