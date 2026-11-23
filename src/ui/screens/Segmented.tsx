/**
 * A segmented radio group for the settings dossier: role="radiogroup", one tab stop, arrow keys move
 * and select (WAI-ARIA radio group pattern).
 */
import { useRef, type KeyboardEvent } from "react";
import s from "./dialogs.module.css";

export interface SegmentedProps<V extends string | number | boolean> {
  label: string;
  value: V;
  options: readonly { value: V; label: string }[];
  onChange(value: V): void;
  id?: string;
}

export function Segmented<V extends string | number | boolean>({ label, value, options, onChange, id }: SegmentedProps<V>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const at = Math.max(0, options.findIndex(o => o.value === value));
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (at + dir + options.length) % options.length;
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  };
  return (
    <div className={s.seg} role="radiogroup" aria-label={label} id={id} onKeyDown={onKey}>
      {options.map((o, i) => (
        <button
          key={String(o.value)}
          ref={el => { refs.current[i] = el; }}
          type="button"
          role="radio"
          aria-checked={i === at}
          tabIndex={i === at ? 0 : -1}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
