import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app";
import { DesignHarness } from "./design-harness";
// The active palette is imported as its own module so the Vite converter
// turns its @theme block into :root variables (FE-024 / FE-036).
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
