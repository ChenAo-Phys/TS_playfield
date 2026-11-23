/**
 * The current arrangement (ui-spec §3): `layoutFor(innerWidth, innerHeight)`, recomputed on resize
 * and orientation change, at most once per animation frame. Without a window (SSR, Node tests) it
 * is "desktop".
 */
import { useEffect, useState } from "react";
import { layoutFor, type LayoutKind } from "../theme";

export function currentLayout(): LayoutKind {
  if (typeof window === "undefined") return "desktop";
  return layoutFor(window.innerWidth, window.innerHeight);
}

export function useLayout(): LayoutKind {
  const [layout, setLayout] = useState<LayoutKind>(currentLayout);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setLayout(currentLayout());
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return layout;
}
