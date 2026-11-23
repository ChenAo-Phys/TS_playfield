/**
 * A deferred Message (src/i18n), rendered now in the current language as React elements, never as
 * HTML: card and country parameters become <CardRef> / <CountryRef> (hover = zoom / map pulse), the
 * catalog's own inline markup (<strong>, <em>, <b>, <i>, <small>, <br>) becomes elements, and anything
 * else, parameter text included, stays text. It redraws on a language switch.
 *
 * How: `render(m, { card, country, text })` wraps each card / country name in private-use sentinels and
 * neutralises "<" in parameter text; `messageParts` then splits the string into parts.
 */
import { Fragment, type ReactNode } from "react";
import { render, type Message } from "../../i18n";
import { useI18n } from "../../i18n/react";
import { CardRef } from "./CardRef";
import { CountryRef } from "./CountryRef";

const REF_OPEN = "";
const REF_SEP = "";
const REF_CLOSE = "";
/** Stands for "<" inside parameter text, so a parameter can never open a tag. */
const LT = "";

export type InlineTag = "strong" | "em" | "b" | "i" | "small";
export type MessagePart =
  | { t: "text"; s: string }
  | { t: "card"; id: number; name: string }
  | { t: "country"; id: number; name: string }
  | { t: "br" }
  | { t: "tag"; tag: InlineTag; children: MessagePart[] };

const TAGS = new Set<InlineTag>(["strong", "em", "b", "i", "small"]);
const guard = (s: string) => s.replace(/</g, LT);

/** The message in the current language with sentinel-wrapped refs (exported for tests). */
export function renderWithSentinels(m: Message): string {
  return render(m, {
    text: guard,
    card: (id, name) => `${REF_OPEN}c${id}${REF_SEP}${guard(name)}${REF_CLOSE}`,
    country: (id, name) => `${REF_OPEN}k${id}${REF_SEP}${guard(name)}${REF_CLOSE}`,
  });
}

/** Split a sentinel-wrapped string into parts (refs, whitelisted inline tags, text). */
export function parseParts(input: string): MessagePart[] {
  let i = 0;
  const restore = (s: string) => s.replace(new RegExp(LT, "g"), "<");

  function parse(until: InlineTag | null): MessagePart[] {
    const out: MessagePart[] = [];
    let text = "";
    const flush = () => {
      if (text) out.push({ t: "text", s: restore(text) });
      text = "";
    };
    while (i < input.length) {
      const ch = input[i]!;
      if (ch === REF_OPEN) {
        const sep = input.indexOf(REF_SEP, i);
        const end = input.indexOf(REF_CLOSE, i);
        if (sep > i && end > sep) {
          flush();
          const kind = input[i + 1];
          const id = Number(input.slice(i + 2, sep));
          const name = restore(input.slice(sep + 1, end));
          out.push(kind === "c" ? { t: "card", id, name } : { t: "country", id, name });
          i = end + 1;
          continue;
        }
      }
      if (ch === "<") {
        const close = input.indexOf(">", i);
        const raw = close > i ? input.slice(i + 1, close).trim() : "";
        const m = /^(\/)?([a-z]+)\s*(\/)?$/i.exec(raw);
        if (m) {
          const name = m[2]!.toLowerCase();
          if (name === "br") {
            flush();
            out.push({ t: "br" });
            i = close + 1;
            continue;
          }
          if (TAGS.has(name as InlineTag)) {
            if (m[1]) {
              if (until === name) {
                i = close + 1;
                flush();
                return out;
              }
              i = close + 1; // stray close tag: drop it
              continue;
            }
            flush();
            i = close + 1;
            out.push({ t: "tag", tag: name as InlineTag, children: parse(name as InlineTag) });
            continue;
          }
        }
      }
      text += ch;
      i++;
    }
    flush();
    return out;
  }
  return parse(null);
}

/** A message as parts, in the current language. */
export function messageParts(m: Message): MessagePart[] {
  return parseParts(renderWithSentinels(m));
}

/** The plain text of parts (for titles, aria labels). */
export function partsText(parts: readonly MessagePart[]): string {
  return parts.map(p => (p.t === "text" ? p.s : p.t === "br" ? "\n" : p.t === "tag" ? partsText(p.children) : p.name)).join("");
}

function toNodes(parts: readonly MessagePart[], refs: boolean): ReactNode[] {
  return parts.map((p, k) => {
    switch (p.t) {
      case "text":
        return <Fragment key={k}>{p.s}</Fragment>;
      case "br":
        return <br key={k} />;
      case "card":
        return refs ? <CardRef key={k} card={p.id}>{p.name}</CardRef> : <Fragment key={k}>{p.name}</Fragment>;
      case "country":
        return refs ? <CountryRef key={k} country={p.id}>{p.name}</CountryRef> : <Fragment key={k}>{p.name}</Fragment>;
      case "tag": {
        const Tag = p.tag;
        return <Tag key={k}>{toNodes(p.children, refs)}</Tag>;
      }
    }
  });
}

export interface MessageTextProps {
  message: Message;
  /** Card / country names as hoverable refs (default true). Pass false inside buttons. */
  refs?: boolean;
}

export function MessageText({ message, refs = true }: MessageTextProps) {
  useI18n(); // re-render on a language switch (render() reads the current language)
  return <>{toNodes(messageParts(message), refs)}</>;
}
