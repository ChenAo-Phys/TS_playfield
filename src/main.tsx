/**
 * Entry point (ui-spec §15.3 W1): the theme (fonts → tokens → base), the page language before the first
 * render (no flash of English), then the app.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./ui/theme/fonts.css";
import "./ui/theme/tokens.css";
import "./ui/theme/base.css";
import { initLanguage } from "./i18n";
import { App } from "./ui/App";

async function main(): Promise<void> {
  try {
    await initLanguage();
  } catch (e) {
    // The English catalogs are bundled; a failed Chinese chunk leaves the page in English.
    console.warn("initLanguage failed", e);
  }
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void main();
