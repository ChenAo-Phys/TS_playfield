/**
 * The button (ui-spec §8.1 actions, final.css `.btn`): primary (ink on paper / paper on room), ghost,
 * brass (the "act here" colour on dark), dark (on room, brass hairline) and danger (hazard stripes).
 * `onPaper` switches the colours and the focus ring for the slip and dossiers. `kbd` shows the shortcut,
 * except on touch screens (`useTouchUi`, ui-spec §3.3 / QA R-011): no key caps there; `aria-keyshortcuts` stays.
 * Without an explicit `keyshortcuts`, a single-key cap names its key there too (`kbdShortcut`: "D" → D, "↵" → Enter,
 * "Esc" → Escape), so the shortcut stays exposed on touch screens, where the cap is gone (QA round 2 integration).
 */
import { forwardRef, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { useTouchUi } from "./touch";
import s from "./Button.module.css";

/** The `aria-keyshortcuts` value a key cap stands for: one Latin letter, "↵" (Enter) or "Esc" (Escape); else none. */
export function kbdShortcut(kbd: string | undefined): string | undefined {
  if (!kbd) return undefined;
  if (/^[A-Z]$/.test(kbd)) return kbd;
  if (kbd === "↵") return "Enter";
  if (kbd === "Esc") return "Escape";
  return undefined;
}

export type ButtonVariant = "primary" | "ghost" | "brass" | "dark" | "danger";
export type ButtonSize = "s" | "m" | "touch";

export interface ButtonProps {
  variant: ButtonVariant;
  /** s = 26 px (slip rows), m = 30 px (default), touch = 44 px (compact). */
  size?: ButtonSize;
  onPaper?: boolean;
  icon?: IconName;
  /** Shortcut hint shown as a key cap ("Z", "↵", "Esc"). Visual only; bind the key with useKey. Hidden on touch. */
  kbd?: string;
  /** Toggle state (aria-pressed). */
  pressed?: boolean;
  disabled?: boolean;
  title?: string;
  onClick(): void;
  children: ReactNode;
  // ── extensions ──
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  /** aria-keyshortcuts value, e.g. "Z Control+Z Meta+Z". */
  keyshortcuts?: string;
  type?: "button" | "submit";
  autoFocus?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size = "m", onPaper = false, icon, kbd, pressed, disabled, title, onClick, children, className, keyshortcuts, type = "button", autoFocus, ...aria },
  ref,
) {
  const touch = useTouchUi();
  const cls = [s.btn, s[variant], s[`size_${size}`], onPaper ? s.onPaper : s.onRoom, className]
    .filter(Boolean).join(" ");
  return (
    <button
      ref={ref}
      type={type}
      className={cls}
      data-variant={variant}
      aria-pressed={pressed === undefined ? undefined : pressed}
      aria-keyshortcuts={keyshortcuts ?? kbdShortcut(kbd)}
      aria-label={aria["aria-label"]}
      aria-describedby={aria["aria-describedby"]}
      title={title}
      disabled={disabled}
      autoFocus={autoFocus}
      onClick={() => { if (!disabled) onClick(); }}
    >
      {icon ? <Icon name={icon} className={s.icon} /> : null}
      <span className={s.label}>{children}</span>
      {kbd && !touch ? <kbd className={s.kbd} aria-hidden="true">{kbd}</kbd> : null}
    </button>
  );
});
