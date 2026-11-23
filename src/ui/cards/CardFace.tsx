/**
 * A card face (ui-spec §7.1): the 500×700 image in the card-image language, lazy, cross-fading when the
 * language changes; at hand size an HTML caption (ops badge + name, 2-line clamp) over the bottom 40 %,
 * whose right padding leaves the strip the next card covers (`overlapRight`); tags hang from the top.
 * An overlapped hand card wears a spine instead of the caption's name (`spine`, QA OD-3): its name as a
 * vertical label in a narrow band of its side's tone along the visible strip's left edge, above the Ops
 * badge, so a crowded hand reads at a glance. The custom property `--spine-on` (0 / 1, default 1) lets the
 * hand swap spine and caption name on hover / focus / staging without a re-render.
 * If the image cannot load, a paper placeholder shows the name and Ops instead.
 *
 * Chinese spines (QA R-013): the glyphs stand upright, and an ellipsis glyph ("…", the browser's own or typed)
 * is drawn into the last character in vertical text ("我们在德黑羊", "红色恐慌 太"); so the name is cut in script to
 * the whole characters that fit the band (measured on the rendered glyphs) and followed by three small drawn
 * dots (`spineMore`, a little apart, no font involved), and a "/" becomes the upright full-width "／"
 * ("红色恐慌／大︙").
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { cardImageUrl, cardInfo } from "../../data";
import { useI18n } from "../../i18n/react";
import { usePrefersReducedMotion } from "../common/hooks";
import { useCardImageLang, type CardImageLang } from "./cardImages";
import s from "./cards.module.css";

export interface CardFaceProps {
  card: number;
  /** Width in CSS px; the height is width × 1.4. */
  width: number;
  /** HTML caption with ops badge and name (hand cards). Ignored below 64 px. */
  caption?: boolean;
  /** Tags hanging from the top edge (CardTags). */
  tags?: ReactNode;
  dim?: "none" | "passive" | "unplayable";
  /** Px of this card covered by the next one (caption padding). */
  overlapRight?: number;
  // ── extensions ──
  /**
   * An overlapped hand card: the name runs down a spine on the visible strip's left edge (the caption keeps
   * the Ops badge). Needs `caption`. The spine is decorative (`aria-hidden`); the name stays the image's alt.
   */
  spine?: boolean;
  /** Load now (the human's hand, the zoomed card) instead of lazily. */
  eager?: boolean;
  /** Force an image language (default: the cardImages setting). */
  imageLang?: CardImageLang;
  className?: string;
}

export const CARD_RATIO = 1.4;

/** A name for a vertical spine: in Chinese a "/" stands upright as the full-width "／" (R-013). */
export function spineName(name: string, cjk: boolean): string {
  return cjk ? name.replace(/\//g, "\uFF0F") : name;
}

export interface SpineCut {
  /** The whole characters shown. */
  text: string;
  /** Cut: an ellipsis follows. */
  more: boolean;
}

/**
 * The spine text that fits a band `avail` px long (R-013): the whole name when it fits, else its longest run of
 * whole characters that leaves room for the ellipsis (`ellipsis` px). `ends[i]` is where character i ends along
 * the line (letter spacing included).
 */
export function cutSpine(chars: readonly string[], ends: readonly number[], avail: number, ellipsis: number): SpineCut {
  const total = ends[ends.length - 1] ?? 0;
  if (!chars.length || total <= avail + 0.5) return { text: chars.join(""), more: false };
  let k = 0;
  while (k < chars.length && (ends[k] ?? Infinity) + ellipsis <= avail + 0.5) k++;
  return { text: chars.slice(0, k).join(""), more: true };
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * A CJK spine's text, cut to fit (R-013). Renders the whole name first, measures each character's end along the
 * band with a Range (no DOM changes), then the cut text; again when the name, width or language changes.
 */
function useSpineText(name: string, cjk: boolean, on: boolean, key: string, band: RefObject<HTMLElement | null>): SpineCut {
  const full = spineName(name, cjk);
  const [cut, setCut] = useState<{ key: string; cut: SpineCut } | null>(null);
  const k = `${key}|${full}`;
  useIsoLayoutEffect(() => {
    if (!cjk || !on || cut?.key === k) return;
    const el = band.current;
    const node = el?.firstElementChild?.firstChild;
    if (!el || !node || node.nodeType !== 3 || typeof document === "undefined") return;
    const cs = getComputedStyle(el);
    const avail = el.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
    const chars = Array.from(full);
    const range = document.createRange();
    const ends: number[] = [];
    let at = 0;
    for (const ch of chars) {
      at += ch.length;
      range.setStart(node, 0);
      range.setEnd(node, at);
      ends.push(range.getBoundingClientRect().height);
    }
    // The dots' slot (cards.module.css `.spineMore`): half an em apart, .75 em long.
    const ellipsis = (parseFloat(cs.fontSize) || 12) * 1.25;
    setCut({ key: k, cut: avail > 0 ? cutSpine(chars, ends, avail, ellipsis) : { text: full, more: false } });
  });
  return cjk && on && cut?.key === k ? cut.cut : { text: full, more: false };
}

/** The ops badge's side class for a card. */
export function opsSide(card: number): "us" | "ussr" | "neutral" {
  const side = cardInfo(card)?.side;
  return side === "US" ? "us" : side === "USSR" ? "ussr" : "neutral";
}

export function CardFace({ card, width, caption = false, tags, dim = "none", overlapRight = 0, spine = false, eager = false, imageLang, className }: CardFaceProps) {
  const { cardName, lang: uiLang } = useI18n();
  const settingLang = useCardImageLang();
  const lang = imageLang ?? settingLang;
  const src = cardImageUrl(card, lang);
  const reduced = usePrefersReducedMotion();
  const info = cardInfo(card);
  const name = cardName(card);

  // Cross-fade: the previous image stays on top and fades out once the new one has loaded.
  const [prev, setPrev] = useState<{ src: string; fading: boolean } | null>(null);
  const last = useRef(src);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (last.current === src) return;
    const old = last.current;
    last.current = src;
    setPrev(reduced ? null : { src: old, fading: false });
  }, [src, reduced]);

  const height = Math.round(width * CARD_RATIO);
  const showCaption = caption && width >= 64;
  const showSpine = showCaption && spine;
  const spineEl = useRef<HTMLSpanElement | null>(null);
  const spineText = useSpineText(name, uiLang.startsWith("zh"), showSpine, `${uiLang}|${width}`, spineEl);
  const style: CSSProperties = {
    width, height,
    ["--ov" as string]: `${Math.max(0, overlapRight)}px`,
    ["--card-r" as string]: width >= 200 ? "var(--ts-radius-card-big)" : width < 40 ? "var(--ts-radius-xs)" : "var(--ts-radius-card)",
  };
  const cls = [s.face, dim !== "none" ? s[`dim_${dim}`] : "", width < 96 ? s.small : "", showSpine ? s.spined : "", className].filter(Boolean).join(" ");
  return (
    <div className={cls} style={style} data-card={card} data-dim={dim} data-spine={showSpine || undefined}>
      {failed === src ? (
        <div className={s.placeholder} role="img" aria-label={name}>
          <span className={`${s.phOps} ${s[`ops_${opsSide(card)}`]} ts-num`}>{info?.ops ?? ""}</span>
          <span className={s.phName}>{name}</span>
        </div>
      ) : (
        <img
          className={s.img}
          src={src}
          alt={name}
          width={width}
          height={height}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          onLoad={() => setPrev(p => (p && !p.fading ? { ...p, fading: true } : p))}
          onError={() => { setFailed(src); setPrev(null); }}
        />
      )}
      {prev ? (
        <img
          className={`${s.img} ${s.prevImg} ${prev.fading ? s.fadeOut : ""}`}
          src={prev.src}
          alt=""
          aria-hidden="true"
          draggable={false}
          onAnimationEnd={() => setPrev(null)}
        />
      ) : null}
      {showCaption ? (
        <div className={s.cap} aria-hidden="true">
          <span className={`${s.ops} ${s[`ops_${opsSide(card)}`]} ts-num`}>{info?.ops ?? ""}</span>
          <span className={s.capName}>{name}</span>
        </div>
      ) : null}
      {showSpine ? (
        <span ref={spineEl} className={`${s.spine} ${s[`spine_${opsSide(card)}`]}`} aria-hidden="true">
          <span className={s.spineText}>{spineText.text}</span>
          {spineText.more ? <span className={s.spineMore} /> : null}
        </span>
      ) : null}
      {tags ? <div className={s.tags}>{tags}</div> : null}
    </div>
  );
}
