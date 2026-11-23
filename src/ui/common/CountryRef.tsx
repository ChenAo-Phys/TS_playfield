/**
 * A country named in running text. Hover 250 ms, click, Enter or Space pulse it on the map
 * (CountryPulseContext; the shell wires it to `MapHandle.pulse`). Without a map it is plain text.
 */
import { useContext, type ReactNode } from "react";
import { useHoverIntent } from "./hooks";
import { CountryPulseContext } from "./countryPulse";
import s from "./common.module.css";

export interface CountryRefProps {
  country: number;
  children: ReactNode;
  className?: string;
}

export function CountryRef({ country, children, className }: CountryRefProps) {
  const pulse = useContext(CountryPulseContext);
  const hover = useHoverIntent(250, { enabled: !!pulse, onStart: () => pulse?.(country) });
  const cls = [s.ref, s.countryRef, className].filter(Boolean).join(" ");
  if (!pulse) return <span className={cls} data-country={country}>{children}</span>;
  return (
    <span
      className={cls}
      data-country={country}
      role="button"
      tabIndex={0}
      {...hover.bind}
      onClick={e => { e.stopPropagation(); pulse(country); }}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          pulse(country);
        }
      }}
    >
      {children}
    </span>
  );
}
