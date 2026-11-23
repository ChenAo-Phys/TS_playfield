/**
 * A side's glyph (★ for the US, hammer and sickle for the USSR), ui-spec §2.4. It takes the text colour
 * (`fill: currentColor`). Decorative by default; with `title` it is an image with that name.
 */
import type { Side } from "../../game/contract";
import { glyphPath } from "./glyphs";
import s from "./common.module.css";

export interface SideGlyphProps {
  side: Side;
  /** Rendered size in CSS px; default 1em (follows the font size). */
  size?: number;
  /** Accessible name; when absent the glyph is hidden from assistive technology. */
  title?: string;
  className?: string;
}

export function SideGlyph({ side, size, title, className }: SideGlyphProps) {
  const dim = size === undefined ? undefined : size;
  return (
    <svg
      className={[s.glyph, className].filter(Boolean).join(" ")}
      viewBox="0 0 24 24"
      width={dim}
      height={dim}
      data-side={side}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <path d={glyphPath(side, size ?? 24)} fill="currentColor" fillRule="nonzero" />
    </svg>
  );
}
