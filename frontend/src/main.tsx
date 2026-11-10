import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app";
import { DesignHarness } from "./design-harness";
// FE-024: the preset from the figma-tailwind-tokens plugin is the design
// centre. It is imported as its own module (not `@import`ed from global.css)
// so the Vite plugin in vite.config.ts converts its `@theme` block to `:root`.
import "./styles/design-preset.css";
import "./styles/global.css";

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("DatasetFactory root element is missing");
}

const showDesignHarness =
  new URLSearchParams(window.location.search).get("view") === "design-harness";

createRoot(rootElement).render(
  <StrictMode>{showDesignHarness ? <DesignHarness /> : <App />}</StrictMode>,
);
