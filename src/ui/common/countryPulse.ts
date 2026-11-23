/**
 * Hovering a country reference (CountryRef) pulses that country on the map. The shell provides the map
 * handle's `pulse` here: `<CountryPulseContext.Provider value={id => mapRef.current?.pulse(id)}>`.
 * Without a provider the pulse is a no-op.
 */
import { createContext, useContext } from "react";

export type CountryPulse = (country: number) => void;

export const CountryPulseContext = createContext<CountryPulse | null>(null);

const noop: CountryPulse = () => undefined;

/** The current pulse function (a no-op when no map is mounted). */
export function useCountryPulse(): CountryPulse {
  return useContext(CountryPulseContext) ?? noop;
}
